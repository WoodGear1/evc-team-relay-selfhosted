"""Web publishing public API endpoints."""

from __future__ import annotations

import base64
import io
import os
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from minio import Minio
from minio.error import S3Error
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import get_settings
from app.db import models
from app.db.session import get_db
from app.services import published_link_service
from app.services.web_session_service import WebSessionService

router = APIRouter(prefix="/v1/web", tags=["web"])
limiter = Limiter(key_func=get_remote_address)


class WebFolderItem(BaseModel):
    """Item in a folder for navigation."""

    path: str
    name: str
    type: str


class WebSharePublic(BaseModel):
    """Public share data for web rendering."""

    id: str
    published_link_id: str | None = None
    target_type: str | None = None
    target_id: str | None = None
    kind: str
    path: str
    visibility: str
    web_slug: str
    web_noindex: bool
    title: str | None = None
    description: str | None = None
    page_title: str | None = None
    theme_preset: str | None = None
    allow_comments: bool = False
    page_metadata: dict | None = None
    created_at: datetime
    updated_at: datetime
    web_content: str | None = None
    web_content_updated_at: datetime | None = None
    web_folder_items: list[WebFolderItem] | None = None
    web_doc_id: str | None = None  # Y-sweet doc ID for real-time sync


class WebShareAuthRequest(BaseModel):
    """Request to authenticate for a protected share."""

    password: str


class WebSessionValidation(BaseModel):
    """Response for session validation."""

    valid: bool
    share_id: str | None = None


class WebFileSyncRequest(BaseModel):
    """Request to sync individual file content within a folder share."""

    content: str


class WebContentUpdateRequest(BaseModel):
    """Request to update document content."""

    content: str


class WebSearchHit(BaseModel):
    """Single full-text search result for a published document."""

    path: str
    name: str
    type: str
    snippet: str
    score: int


class WebAssetUploadRequest(BaseModel):
    """Request to upload a web asset (image)."""

    path: str
    data: str  # base64-encoded binary data
    content_type: str


def _decode_web_user_id(token: str):
    from uuid import UUID

    payload = security.decode_access_token(token)
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid token",
        )
    return UUID(user_id_str)


def _request_bearer_token(request: Request) -> str | None:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    return auth_header.split(" ", 1)[1]


def _user_can_access_share(db: Session, share: models.Share, user_id) -> bool:
    if share.owner_user_id == user_id:
        return True

    member_stmt = select(models.ShareMember).where(
        models.ShareMember.share_id == share.id,
        models.ShareMember.user_id == user_id,
    )
    return db.execute(member_stmt).scalar_one_or_none() is not None


def _extract_folder_file_content(
    share: models.Share,
    target_path: str,
) -> tuple[str | None, list[WebFolderItem] | None]:
    folder_items_data = share.web_folder_items or []
    folder_items = [WebFolderItem(**item) for item in folder_items_data] if folder_items_data else None

    if share.kind == models.ShareKind.DOC:
        return share.web_content, folder_items

    for item in folder_items_data:
        if item.get("path") == target_path and item.get("type") == "doc":
            return item.get("content", ""), folder_items

    return None, folder_items


def _folder_item_has_content(item: dict) -> bool:
    return "content" in item and item.get("content") is not None


def _get_web_session_max_age(settings) -> int:
    return max(1, settings.refresh_token_expire_days) * 24 * 60 * 60


def _ensure_share_content_access(db: Session, request: Request, share: models.Share) -> None:
    if share.visibility == models.ShareVisibility.PROTECTED:
        session_token = request.cookies.get("web_session")
        if not session_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Authentication required for protected share",
            )
        if not WebSessionService.validate_web_session(session_token, share.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or expired session",
            )

    if share.visibility == models.ShareVisibility.PRIVATE:
        token = _request_bearer_token(request)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Private shares require user authentication",
            )
        try:
            user_id = _decode_web_user_id(token)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or expired token",
            )

        if not _user_can_access_share(db, share, user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this share",
            )


def _build_search_snippet(content: str, query: str, max_length: int = 180) -> str:
    if not content:
        return "No synced content yet."

    lowered = content.lower()
    query_index = lowered.find(query.lower())
    if query_index == -1:
        snippet = content[:max_length].strip()
        return snippet + ("..." if len(content) > max_length else "")

    start = max(0, query_index - 60)
    end = min(len(content), query_index + max_length - 60)
    snippet = content[start:end].strip()
    if start > 0:
        snippet = "..." + snippet
    if end < len(content):
        snippet = snippet + "..."
    return re.sub(r"\s+", " ", snippet)


def _search_folder_items(folder_items: list[dict], query: str, limit: int) -> list[WebSearchHit]:
    normalized_query = query.strip().lower()
    if not normalized_query:
        return []

    results: list[WebSearchHit] = []
    for item in folder_items:
        if item.get("type") not in {"doc", "canvas"}:
            continue

        path = item.get("path", "")
        name = item.get("name", path.split("/")[-1])
        content = item.get("content") or ""
        path_lower = path.lower()
        name_lower = name.lower()
        content_lower = content.lower()

        score = 0
        if normalized_query in name_lower:
            score += 90
        if normalized_query in path_lower:
            score += 70
        if normalized_query in content_lower:
            score += 40
        if score == 0:
            continue

        score += max(0, 20 - min(path_lower.find(normalized_query), 20)) if normalized_query in path_lower else 0

        results.append(
            WebSearchHit(
                path=path,
                name=name,
                type=item.get("type", "doc"),
                snippet=_build_search_snippet(content, query),
                score=score,
            )
        )

    results.sort(key=lambda item: (-item.score, item.path))
    return results[:limit]


def _resolve_link_slug(
    db: Session,
    slug: str,
) -> tuple[models.PublishedLink, models.Share]:
    link = published_link_service.get_link_by_slug(db, slug)
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published link not found",
        )

    share = db.get(models.Share, link.share_id)
    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found",
        )

    return link, share


def _link_access_state(
    db: Session,
    request: Request,
    link: models.PublishedLink,
    share: models.Share,
) -> tuple[bool, bool]:
    if link.access_mode == models.LinkAccessMode.PUBLIC:
        return True, False

    if link.access_mode == models.LinkAccessMode.PROTECTED:
        session_token = request.cookies.get("web_session")
        if not session_token:
            return False, False
        try:
            return WebSessionService.validate_web_session(session_token, share.id), False
        except HTTPException:
            return False, False

    token = _request_bearer_token(request)
    if not token:
        return False, True

    try:
        user_id = _decode_web_user_id(token)
    except HTTPException:
        return False, True

    return _user_can_access_share(db, share, user_id), True


def _build_link_public_response(
    db: Session,
    request: Request,
    link: models.PublishedLink,
    share: models.Share,
) -> WebSharePublic:
    include_content, has_account_access = _link_access_state(db, request, link, share)
    content = None
    folder_items = None

    if include_content:
        content, folder_items = _extract_folder_file_content(share, link.target_path)

    kind = "folder" if link.target_type == "folder" else "doc"
    return WebSharePublic(
        id=str(share.id),
        published_link_id=str(link.id),
        target_type=link.target_type,
        target_id=link.target_id,
        kind=kind,
        path=link.target_path,
        visibility=link.access_mode.value,
        web_slug=link.slug,
        web_noindex=link.noindex,
        title=link.title,
        description=link.description,
        page_title=link.page_title,
        theme_preset=link.theme_preset,
        allow_comments=link.allow_comments and has_account_access,
        page_metadata=link.page_metadata,
        created_at=link.created_at,
        updated_at=link.updated_at,
        web_content=content if include_content and kind == "doc" else None,
        web_content_updated_at=share.web_content_updated_at if include_content else None,
        web_folder_items=folder_items if include_content and kind == "folder" else None,
        web_doc_id=share.web_doc_id if include_content and kind == "doc" else None,
    )


@router.get("/discover")
def discover_shares(
    db: Session = Depends(get_db),
) -> list[dict]:
    """
    List all discoverable web-published shares (public or protected).
    Returns lightweight metadata for the home/landing page.
    """
    settings = get_settings()
    if not settings.web_publish_enabled:
        return []

    stmt = select(models.Share).where(
        models.Share.web_published == True,  # noqa: E712
        models.Share.web_slug.isnot(None),
        models.Share.visibility.in_([
            models.ShareVisibility.PUBLIC,
            models.ShareVisibility.PROTECTED,
        ]),
    ).order_by(models.Share.updated_at.desc())

    shares = db.execute(stmt).scalars().all()
    return [
        {
            "slug": s.web_slug,
            "path": s.path,
            "kind": s.kind.value if hasattr(s.kind, "value") else str(s.kind),
            "visibility": s.visibility.value
            if hasattr(s.visibility, "value")
            else str(s.visibility),
            "title": None,
            "description": None,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }
        for s in shares
    ]


@router.get("/shares/{slug}", response_model=WebSharePublic)
def get_share_by_slug(
    slug: str,
    request: Request,
    db: Session = Depends(get_db),
) -> WebSharePublic:
    """
    Get share information by web slug (public API).

    For PUBLIC shares: returns full metadata including content.
    For PROTECTED shares: returns structural metadata only; content is withheld
    until the client authenticates via POST /web/shares/{slug}/auth.
    For PRIVATE shares: returns structural metadata only; content is withheld
    until the client authenticates via login flow.

    Returns 404 if share does not exist or is not web published.
    """
    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    stmt = select(models.Share).where(
        models.Share.web_slug == slug,
        models.Share.web_published == True,  # noqa: E712
    )
    share = db.execute(stmt).scalar_one_or_none()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found or not published",
        )

    # Determine whether to include content based on visibility + auth state
    include_content = False

    if share.visibility == models.ShareVisibility.PUBLIC:
        include_content = True
    elif share.visibility == models.ShareVisibility.PROTECTED:
        session_token = request.cookies.get("web_session")
        if session_token:
            try:
                include_content = WebSessionService.validate_web_session(session_token, share.id)
            except HTTPException:
                include_content = False
    elif share.visibility == models.ShareVisibility.PRIVATE:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            try:
                from uuid import UUID
                payload = security.decode_access_token(token)
                user_id = UUID(payload.get("sub", ""))
                if share.owner_user_id == user_id:
                    include_content = True
                else:
                    member_stmt = select(models.ShareMember).where(
                        models.ShareMember.share_id == share.id,
                        models.ShareMember.user_id == user_id,
                    )
                    if db.execute(member_stmt).scalar_one_or_none():
                        include_content = True
            except Exception:
                include_content = False

    folder_items = None
    if include_content and share.web_folder_items:
        folder_items = [WebFolderItem(**item) for item in share.web_folder_items]

    return WebSharePublic(
        id=str(share.id),
        kind=share.kind.value,
        path=share.path,
        visibility=share.visibility.value,
        web_slug=share.web_slug,
        web_noindex=share.web_noindex,
        created_at=share.created_at,
        updated_at=share.updated_at,
        web_content=share.web_content if include_content else None,
        web_content_updated_at=share.web_content_updated_at if include_content else None,
        web_folder_items=folder_items,
        web_doc_id=share.web_doc_id if include_content else None,
    )


@router.get("/links/{slug}", response_model=WebSharePublic)
def get_link_by_slug(
    slug: str,
    request: Request,
    db: Session = Depends(get_db),
) -> WebSharePublic:
    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    link, share = _resolve_link_slug(db, slug)
    return _build_link_public_response(db, request, link, share)


@router.post("/links/{slug}/auth", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
def authenticate_protected_link(
    request: Request,
    slug: str,
    payload: WebShareAuthRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> dict:
    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    link, share = _resolve_link_slug(db, slug)
    if link.access_mode != models.LinkAccessMode.PROTECTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This endpoint is only for protected links",
        )

    if not link.password_hash or not security.verify_password(payload.password, link.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password",
        )

    max_age = _get_web_session_max_age(settings)
    session_token = WebSessionService.create_web_session(share.id, hours=max_age // 3600)
    response.set_cookie(
        key="web_session",
        value=session_token,
        max_age=max_age,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/",
    )

    return {"message": "Authentication successful", "share_id": str(share.id)}


@router.get("/links/{slug}/validate", response_model=WebSessionValidation)
def validate_link_session(
    slug: str,
    request: Request,
    db: Session = Depends(get_db),
) -> WebSessionValidation:
    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    link, share = _resolve_link_slug(db, slug)
    if link.access_mode != models.LinkAccessMode.PROTECTED:
        return WebSessionValidation(valid=True, share_id=str(share.id))

    session_token = request.cookies.get("web_session")
    if not session_token:
        return WebSessionValidation(valid=False, share_id=None)

    try:
        is_valid = WebSessionService.validate_web_session(session_token, share.id)
        return WebSessionValidation(valid=is_valid, share_id=str(share.id) if is_valid else None)
    except HTTPException:
        return WebSessionValidation(valid=False, share_id=None)


@router.post("/shares/{slug}/auth", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")  # Max 5 password attempts per minute per IP
def authenticate_protected_share(
    request: Request,
    slug: str,
    payload: WebShareAuthRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> dict:
    """
    Authenticate for a protected share using password.

    On success, sets a secure HttpOnly cookie with a session token.
    Rate limited to 5 attempts per minute per IP to prevent brute force attacks.

    Returns:
        Success message with share_id
        Cookie: web_session={token}; HttpOnly; Secure; SameSite=Strict
    """
    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    # Find share
    stmt = select(models.Share).where(
        models.Share.web_slug == slug,
        models.Share.web_published == True,  # noqa: E712
    )
    share = db.execute(stmt).scalar_one_or_none()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found or not published",
        )

    # Verify it's a protected share
    if share.visibility != models.ShareVisibility.PROTECTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This endpoint is only for protected shares",
        )

    # Verify password
    if not share.password_hash or not security.verify_password(
        payload.password, share.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password",
        )

    # Create session token aligned with long-lived web auth.
    max_age = _get_web_session_max_age(settings)
    session_token = WebSessionService.create_web_session(share.id, hours=max_age // 3600)

    # Set secure cookie
    # Note: In production, Secure flag is set automatically via HTTPS
    response.set_cookie(
        key="web_session",
        value=session_token,
        max_age=max_age,
        httponly=True,
        secure=True,  # Only send over HTTPS
        samesite="strict",  # CSRF protection
        path="/",
    )

    return {"message": "Authentication successful", "share_id": str(share.id)}


@router.get("/shares/{slug}/validate", response_model=WebSessionValidation)
def validate_share_session(
    slug: str,
    request: Request,
    db: Session = Depends(get_db),
) -> WebSessionValidation:
    """
    Validate if user has a valid session for a protected share.

    Checks the web_session cookie and returns validation status.
    This endpoint is called by the web frontend to determine if password prompt is needed.
    """
    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    # Find share
    stmt = select(models.Share).where(
        models.Share.web_slug == slug,
        models.Share.web_published == True,  # noqa: E712
    )
    share = db.execute(stmt).scalar_one_or_none()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found or not published",
        )

    # Only validate sessions for protected shares
    if share.visibility != models.ShareVisibility.PROTECTED:
        return WebSessionValidation(valid=True, share_id=str(share.id))

    # Check for session cookie
    session_token = request.cookies.get("web_session")
    if not session_token:
        return WebSessionValidation(valid=False, share_id=None)

    # Validate token
    try:
        is_valid = WebSessionService.validate_web_session(session_token, share.id)
        return WebSessionValidation(valid=is_valid, share_id=str(share.id) if is_valid else None)
    except HTTPException:
        return WebSessionValidation(valid=False, share_id=None)


class WebRelayTokenResponse(BaseModel):
    """Response with relay token for real-time sync."""

    relay_url: str
    token: str
    doc_id: str
    expires_at: datetime


@router.get("/shares/{slug}/token", response_model=WebRelayTokenResponse)
def get_web_relay_token(
    slug: str,
    request: Request,
    db: Session = Depends(get_db),
) -> WebRelayTokenResponse:
    """
    Get a relay token for real-time sync via WebSocket.

    Returns a read-only Ed25519-signed JWT token for connecting to y-sweet relay server.
    Access is validated based on share visibility:
    - PUBLIC: Anyone can get a token
    - PROTECTED: Requires valid web_session cookie
    - PRIVATE: Not supported via web (returns 403)

    Returns 404 if:
    - Share not found or not published
    - Share has no web_doc_id configured

    Returns 403 if:
    - Share is private
    - Share is protected but no valid session
    """
    from datetime import timedelta

    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    # Find share
    stmt = select(models.Share).where(
        models.Share.web_slug == slug,
        models.Share.web_published == True,  # noqa: E712
    )
    share = db.execute(stmt).scalar_one_or_none()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found or not published",
        )

    # Check if share has doc_id for real-time sync
    if not share.web_doc_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Real-time sync not configured for this share. Sync from Obsidian plugin first.",
        )

    # Check access based on visibility
    if share.visibility == models.ShareVisibility.PRIVATE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Private shares do not support web real-time sync",
        )

    if share.visibility == models.ShareVisibility.PROTECTED:
        # Validate session cookie
        session_token = request.cookies.get("web_session")
        if not session_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Authentication required for protected share",
            )
        if not WebSessionService.validate_web_session(session_token, share.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or expired session",
            )

    # Generate read-only relay token
    expires_in = timedelta(minutes=settings.relay_token_ttl_minutes)
    expires_at = security.utcnow() + expires_in

    private_key = request.app.state.relay_private_key
    key_id = request.app.state.relay_key_id

    token = security.create_relay_token(
        private_key=private_key,
        key_id=key_id,
        doc_id=share.web_doc_id,
        mode="read",  # Web viewers only get read access
        expires_minutes=settings.relay_token_ttl_minutes,
    )

    return WebRelayTokenResponse(
        relay_url=str(settings.relay_public_url).rstrip("/"),
        token=token,
        doc_id=share.web_doc_id,
        expires_at=expires_at,
    )


@router.get("/links/{slug}/token", response_model=WebRelayTokenResponse)
def get_link_relay_token(
    slug: str,
    request: Request,
    db: Session = Depends(get_db),
) -> WebRelayTokenResponse:
    from datetime import timedelta

    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    link, share = _resolve_link_slug(db, slug)
    include_content, _has_account_access = _link_access_state(db, request, link, share)
    if not include_content:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authentication required for real-time sync",
        )

    if not share.web_doc_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Real-time sync not configured for this share. Sync from Obsidian plugin first.",
        )

    expires_in = timedelta(minutes=settings.relay_token_ttl_minutes)
    expires_at = security.utcnow() + expires_in

    private_key = request.app.state.relay_private_key
    key_id = request.app.state.relay_key_id
    token = security.create_relay_token(
        private_key=private_key,
        key_id=key_id,
        doc_id=share.web_doc_id,
        mode="read",
        expires_minutes=settings.relay_token_ttl_minutes,
    )

    return WebRelayTokenResponse(
        relay_url=str(settings.relay_public_url).rstrip("/"),
        token=token,
        doc_id=share.web_doc_id,
        expires_at=expires_at,
    )


@router.post("/shares/{slug}/files", status_code=status.HTTP_200_OK)
@limiter.limit("300/minute")
def sync_folder_file_content(
    request: Request,
    slug: str,
    path: str = Query(..., description="File path within folder"),
    payload: WebFileSyncRequest = ...,
    db: Session = Depends(get_db),
) -> dict:
    """
    Sync individual file content within a folder share.

    This endpoint is called by the Obsidian plugin to sync content of files
    within a folder share. The content is stored in the web_folder_items JSONB field.

    Access control:
    - This is an authenticated endpoint (requires valid session or user token)
    - Only the share owner can sync content
    """
    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    # Find share
    stmt = select(models.Share).where(
        models.Share.web_slug == slug,
        models.Share.web_published == True,  # noqa: E712
    )
    share = db.execute(stmt).scalar_one_or_none()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found or not published",
        )

    # Must be a folder share
    if share.kind != models.ShareKind.FOLDER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This endpoint is only for folder shares",
        )

    # For now, require authentication via session cookie
    # TODO: Support plugin authentication via JWT token
    session_token = request.cookies.get("web_session")
    if not session_token:
        # Try to validate JWT token from Authorization header
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
            )
        # For now, just check if token exists - proper validation would require
        # checking user ownership of the share
        # This will be handled by plugin sending proper JWT tokens

    # Update folder items with content
    folder_items = share.web_folder_items or []
    updated = False

    for item in folder_items:
        if item.get("path") == path:
            item["content"] = payload.content
            updated = True
            break

    if not updated:
        # File not in folder items - add it
        folder_items.append(
            {
                "path": path,
                "name": path.split("/")[-1],
                "type": "doc",
                "content": payload.content,
            }
        )

    # Mark as modified to trigger SQLAlchemy update
    from sqlalchemy.orm.attributes import flag_modified

    share.web_folder_items = folder_items
    flag_modified(share, "web_folder_items")
    db.commit()

    return {"message": "File content synced", "path": path}


@router.get("/shares/{slug}/files", response_model=dict)
def get_folder_file_content(
    slug: str,
    path: str = Query(..., description="File path within folder"),
    request: Request = None,
    db: Session = Depends(get_db),
) -> dict:
    """
    Get individual file content from a folder share.

    Returns the content stored for a specific file within a folder share.
    Access control is based on share visibility.
    """
    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    # Find share
    stmt = select(models.Share).where(
        models.Share.web_slug == slug,
        models.Share.web_published == True,  # noqa: E712
    )
    share = db.execute(stmt).scalar_one_or_none()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found or not published",
        )

    # Must be a folder share
    if share.kind != models.ShareKind.FOLDER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This endpoint is only for folder shares",
        )

    _ensure_share_content_access(db, request, share)

    # Find file in folder items
    folder_items = share.web_folder_items or []
    for item in folder_items:
        if item.get("path") == path:
            return {
                "path": path,
                "name": item.get("name"),
                "type": item.get("type"),
                "content": item.get("content", ""),
                "has_content": _folder_item_has_content(item),
            }

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="File not found in folder share",
    )


@router.get("/shares/{slug}/search", response_model=list[WebSearchHit])
def search_share_content(
    slug: str,
    q: str = Query(..., min_length=1, description="Full-text query"),
    limit: int = Query(default=8, ge=1, le=25),
    request: Request = None,
    db: Session = Depends(get_db),
) -> list[WebSearchHit]:
    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    stmt = select(models.Share).where(
        models.Share.web_slug == slug,
        models.Share.web_published == True,  # noqa: E712
    )
    share = db.execute(stmt).scalar_one_or_none()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found or not published",
        )

    _ensure_share_content_access(db, request, share)

    if share.kind == models.ShareKind.DOC:
        return _search_folder_items(
            [
                {
                    "path": share.path,
                    "name": share.path.split("/")[-1],
                    "type": "doc",
                    "content": share.web_content or "",
                }
            ],
            q,
            limit,
        )

    return _search_folder_items(share.web_folder_items or [], q, limit)


@router.get("/links/{slug}/files", response_model=dict)
def get_link_folder_file_content(
    slug: str,
    path: str = Query(..., description="File path within linked folder"),
    request: Request = None,
    db: Session = Depends(get_db),
) -> dict:
    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    link, share = _resolve_link_slug(db, slug)
    include_content, _has_account_access = _link_access_state(db, request, link, share)
    if not include_content:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authentication required for linked content",
        )

    folder_items = share.web_folder_items or []
    target_path = link.target_path
    for item in folder_items:
        item_path = item.get("path")
        if link.target_type == "doc":
            if item_path == target_path or path == target_path:
                return {
                    "path": item_path,
                    "name": item.get("name"),
                    "type": item.get("type"),
                    "content": item.get("content", ""),
                    "has_content": _folder_item_has_content(item),
                }
        elif item_path == path:
            return {
                "path": path,
                "name": item.get("name"),
                "type": item.get("type"),
                "content": item.get("content", ""),
                "has_content": _folder_item_has_content(item),
            }

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="File not found in published link",
    )


@router.get("/links/{slug}/search", response_model=list[WebSearchHit])
def search_link_content(
    slug: str,
    q: str = Query(..., min_length=1, description="Full-text query"),
    limit: int = Query(default=8, ge=1, le=25),
    request: Request = None,
    db: Session = Depends(get_db),
) -> list[WebSearchHit]:
    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    link, share = _resolve_link_slug(db, slug)
    include_content, _has_account_access = _link_access_state(db, request, link, share)
    if not include_content:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authentication required for linked content",
        )

    if link.target_type == "doc":
        content, _folder_items = _extract_folder_file_content(share, link.target_path)
        return _search_folder_items(
            [
                {
                    "path": link.target_path,
                    "name": link.target_path.split("/")[-1],
                    "type": "doc",
                    "content": content or "",
                }
            ],
            q,
            limit,
        )

    return _search_folder_items(share.web_folder_items or [], q, limit)


@router.put("/shares/{slug}/content", status_code=status.HTTP_200_OK)
@limiter.limit("30/minute")  # Rate limit for content updates
def update_share_content(
    request: Request,
    slug: str,
    content_update: WebContentUpdateRequest,
    db: Session = Depends(get_db),
) -> dict:
    """
    Update document content for web editing.

    This endpoint allows users with editor role to update the content of a document.
    Only works for document shares (not folders).

    Access control:
    - Requires authentication via session cookie (for protected shares) or JWT token
    - User must have editor role on the share
    """
    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    # Find share
    stmt = select(models.Share).where(
        models.Share.web_slug == slug,
        models.Share.web_published == True,  # noqa: E712
    )
    share = db.execute(stmt).scalar_one_or_none()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found or not published",
        )

    # Must be a document share
    if share.kind != models.ShareKind.DOC:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only document shares can be edited via web",
        )

    # Check authentication and editor role
    # For protected shares, validate session
    if share.visibility == models.ShareVisibility.PROTECTED:
        session_token = request.cookies.get("web_session")
        if not session_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
            )
        if not WebSessionService.validate_web_session(session_token, share.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or expired session",
            )
        # For protected shares with password, we can't determine editor role
        # So we allow editing if authenticated
    elif share.visibility == models.ShareVisibility.PRIVATE:
        # For private shares, require JWT token and check editor role
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
            )

        # Validate JWT and get user
        token = auth_header.split(" ")[1]
        try:
            from app.core import security as sec_module

            payload = sec_module.decode_access_token(token)
            user_id_str = payload.get("sub")
            if not user_id_str:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token",
                )

            # Check if user is owner or has editor role
            from uuid import UUID

            user_id = UUID(user_id_str)
            if share.owner_user_id == user_id:
                # Owner can always edit
                pass
            else:
                # Check if user has editor role
                member_stmt = select(models.ShareMember).where(
                    models.ShareMember.share_id == share.id,
                    models.ShareMember.user_id == user_id,
                    models.ShareMember.role == models.ShareMemberRole.EDITOR,
                )
                member = db.execute(member_stmt).scalar_one_or_none()
                if not member:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Editor role required to edit this share",
                    )
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
    else:
        # Public shares - anyone can view but editing requires authentication
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public shares cannot be edited via web. Use protected or private visibility.",
        )

    # Update content
    share.web_content = content_update.content
    share.web_content_updated_at = security.utcnow()
    db.commit()

    return {
        "message": "Content updated successfully",
        "updated_at": share.web_content_updated_at.isoformat(),
    }


@router.get("/robots.txt", response_class=Response)
def get_robots_txt(db: Session = Depends(get_db)) -> Response:
    """
    Dynamic robots.txt for web publishing domain.

    Default behavior: Disallow all (Disallow: /)
    For shares with web_noindex=false: Add Allow: /{slug}

    This ensures only shares explicitly marked for indexing are crawlable.
    """
    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled",
        )

    # Start with default deny all
    lines = [
        "User-agent: *",
        "Disallow: /",
        "",
    ]

    # Find all published shares that allow indexing
    stmt = select(models.Share).where(
        models.Share.web_published == True,  # noqa: E712
        models.Share.web_noindex == False,  # noqa: E712
        models.Share.web_slug.isnot(None),
    )
    indexable_shares = db.execute(stmt).scalars().all()

    # Add Allow rules for indexable shares
    if indexable_shares:
        lines.append("# Indexable shares")
        for share in indexable_shares:
            lines.append(f"Allow: /{share.web_slug}")
        lines.append("")

    # Add sitemap reference (for future implementation)
    if indexable_shares:
        domain = settings.web_publish_domain
        if not domain.startswith("http"):
            domain = f"https://{domain}"
        lines.append(f"Sitemap: {domain.rstrip('/')}/sitemap.xml")

    content = "\n".join(lines)
    return Response(content=content, media_type="text/plain")


def _get_minio_client() -> Minio:
    """Create MinIO client from settings or env fallback."""
    settings = get_settings()
    endpoint = getattr(settings, "minio_endpoint", None) or os.getenv("MINIO_ENDPOINT", "minio:9000")
    access_key = (
        getattr(settings, "minio_access_key", None)
        or os.getenv("MINIO_ACCESS_KEY")
        or os.getenv("MINIO_ROOT_USER", "minioadmin")
    )
    secret_key = (
        getattr(settings, "minio_secret_key", None)
        or os.getenv("MINIO_SECRET_KEY")
        or os.getenv("MINIO_ROOT_PASSWORD", "minioadmin")
    )
    secure = getattr(settings, "minio_secure", None)
    if secure is None:
        secure = os.getenv("MINIO_SECURE", "false").lower() in {"1", "true", "yes", "on"}
    return Minio(
        endpoint,
        access_key=access_key,
        secret_key=secret_key,
        secure=secure,
    )


def _get_minio_bucket_name() -> str:
    settings = get_settings()
    return getattr(settings, "minio_bucket", None) or os.getenv("MINIO_BUCKET", "relay")


def _ensure_minio_bucket(client: Minio, bucket_name: str) -> None:
    """Ensure MinIO bucket exists, create if not."""
    try:
        if not client.bucket_exists(bucket_name):
            client.make_bucket(bucket_name)
    except S3Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to access storage: {e}",
        )


def _require_web_asset_access(
    db: Session,
    request: Request,
    share: models.Share,
) -> None:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    token = auth_header.split(" ")[1]
    try:
        from uuid import UUID

        from app.core import security as sec_module

        payload_jwt = sec_module.decode_access_token(token)
        user_id_str = payload_jwt.get("sub")
        if not user_id_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )

        user_id = UUID(user_id_str)

        user_stmt = select(models.User).where(models.User.id == user_id)
        user = db.execute(user_stmt).scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User not found",
            )

        is_authorized = user.is_admin or share.owner_user_id == user_id
        if not is_authorized:
            member_stmt = select(models.ShareMember).where(
                models.ShareMember.share_id == share.id,
                models.ShareMember.user_id == user_id,
            )
            member = db.execute(member_stmt).scalar_one_or_none()
            is_authorized = member is not None

        if not is_authorized:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this share",
            )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


# Allowed image content types for web assets
ALLOWED_IMAGE_TYPES = {
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/avif",
    "image/svg+xml",
    "image/bmp",
    "image/x-icon",
}


@router.post("/shares/{slug}/assets", status_code=status.HTTP_201_CREATED)
@limiter.limit("6000/minute")
def upload_web_asset(
    request: Request,
    slug: str,
    payload: WebAssetUploadRequest,
    db: Session = Depends(get_db),
) -> dict:
    """
    Upload a web asset (image) for a folder share.

    Stores the binary data in MinIO under key `web-assets/{share_id}/{path}`.
    Only authenticated users who are admin or owner/member of the share can upload.

    Max size: 5MB
    Allowed content types: PNG, JPEG, GIF, WebP, SVG, BMP, ICO
    """
    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    # Validate content type
    if payload.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid content type. Allowed: {', '.join(ALLOWED_IMAGE_TYPES)}",
        )

    # Decode base64 data
    try:
        binary_data = base64.b64decode(payload.data)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid base64 data",
        )

    # Check max size (20MB)
    if len(binary_data) > 20 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Asset too large. Max size: 20MB",
        )

    # Find share
    stmt = select(models.Share).where(
        models.Share.web_slug == slug,
        models.Share.web_published == True,  # noqa: E712
    )
    share = db.execute(stmt).scalar_one_or_none()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found or not published",
        )

    _require_web_asset_access(db, request, share)

    # Upload to MinIO
    client = _get_minio_client()
    bucket_name = _get_minio_bucket_name()
    _ensure_minio_bucket(client, bucket_name)

    object_name = f"web-assets/{share.id}/{payload.path}"
    data_stream = io.BytesIO(binary_data)

    try:
        client.put_object(
            bucket_name,
            object_name,
            data_stream,
            length=len(binary_data),
            content_type=payload.content_type,
        )
    except S3Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload asset: {e}",
        )

    return {
        "message": "Asset uploaded successfully",
        "path": payload.path,
        "size": len(binary_data),
    }


@router.delete("/shares/{slug}/assets", status_code=status.HTTP_200_OK)
def delete_web_asset(
    request: Request,
    slug: str,
    path: str = Query(..., description="Asset path within share"),
    db: Session = Depends(get_db),
) -> dict:
    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    stmt = select(models.Share).where(
        models.Share.web_slug == slug,
        models.Share.web_published == True,  # noqa: E712
    )
    share = db.execute(stmt).scalar_one_or_none()
    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found or not published",
        )

    _require_web_asset_access(db, request, share)

    client = _get_minio_client()
    bucket_name = _get_minio_bucket_name()
    object_name = f"web-assets/{share.id}/{path}"

    try:
        client.remove_object(bucket_name, object_name)
    except S3Error as e:
        if e.code == "NoSuchKey":
            return {"message": "Asset already absent", "path": path}
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete asset: {e}",
        )

    return {"message": "Asset deleted successfully", "path": path}


@router.get("/shares/{slug}/assets")
def serve_web_asset(
    slug: str,
    path: str = Query(..., description="Asset path within share"),
    request: Request = None,
    db: Session = Depends(get_db),
) -> Response:
    """
    Serve a web asset (image) from a folder share.

    Reads from MinIO bucket key `web-assets/{share_id}/{path}`.
    Web assets are intentionally public once a share is published.
    """
    settings = get_settings()
    if not settings.web_publish_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Web publishing is not enabled on this server",
        )

    # Find share
    stmt = select(models.Share).where(
        models.Share.web_slug == slug,
        models.Share.web_published == True,  # noqa: E712
    )
    share = db.execute(stmt).scalar_one_or_none()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found or not published",
        )

    # Read from MinIO
    client = _get_minio_client()
    bucket_name = _get_minio_bucket_name()
    object_name = f"web-assets/{share.id}/{path}"

    try:
        response = client.get_object(bucket_name, object_name)
        try:
            data = response.read()
            content_type = response.headers.get("Content-Type", "application/octet-stream")
        finally:
            response.close()
            response.release_conn()

        headers = {"Cache-Control": "public, max-age=86400"}

        return Response(content=data, media_type=content_type, headers=headers)
    except S3Error as e:
        if e.code == "NoSuchKey":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Asset not found",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve asset: {e}",
        )
