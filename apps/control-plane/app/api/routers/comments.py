"""Comments API — threads, replies, resolve/reopen."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.api import deps
from app.db import models
from app.db.session import get_db
from app.schemas import published_link as link_schema
from app.services import comment_service, published_link_service
from app.services.share_service import get_share

router = APIRouter(tags=["comments"])


def _ensure_comment_access(
    db: Session,
    share: models.Share,
    user: models.User,
) -> None:
    """Verify user has at least read access to the share for commenting."""
    if user.is_admin or share.owner_user_id == user.id:
        return
    from sqlalchemy import select
    stmt = select(models.ShareMember).where(
        models.ShareMember.share_id == share.id,
        models.ShareMember.user_id == user.id,
    )
    member = db.execute(stmt).scalar_one_or_none()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to this share is required for commenting",
        )


# ---------------------------------------------------------------------------
# Via published link context
# ---------------------------------------------------------------------------


@router.get(
    "/published-links/{link_id}/comments",
    response_model=list[link_schema.CommentThreadRead],
)
def list_link_comments(
    link_id: uuid.UUID,
    include_resolved: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    link = published_link_service.get_link(db, link_id)
    if not link.allow_comments:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Comments are disabled for this link",
        )

    share = get_share(db, link.share_id)
    _ensure_comment_access(db, share, current_user)

    threads = comment_service.list_threads(
        db,
        share_id=link.share_id,
        target_id=link.target_id,
        include_resolved=include_resolved,
        skip=skip,
        limit=limit,
    )
    return [link_schema.CommentThreadRead.model_validate(t) for t in threads]


@router.post(
    "/published-links/{link_id}/comments/threads",
    response_model=link_schema.CommentThreadRead,
    status_code=status.HTTP_201_CREATED,
)
def create_link_comment_thread(
    link_id: uuid.UUID,
    request: Request,
    payload: link_schema.CommentThreadCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    link = published_link_service.get_link(db, link_id)
    if not link.allow_comments:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Comments are disabled for this link",
        )

    share = get_share(db, link.share_id)
    _ensure_comment_access(db, share, current_user)

    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    thread = comment_service.create_thread(
        db, share, current_user, payload,
        published_link_id=link.id,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return link_schema.CommentThreadRead.model_validate(thread)


# ---------------------------------------------------------------------------
# Thread-level operations
# ---------------------------------------------------------------------------


@router.post(
    "/comment-threads/{thread_id}/reply",
    response_model=link_schema.CommentItemRead,
    status_code=status.HTTP_201_CREATED,
)
def reply_to_thread(
    thread_id: uuid.UUID,
    request: Request,
    payload: link_schema.CommentReplyCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    thread = comment_service.get_thread(db, thread_id)
    share = get_share(db, thread.share_id)
    _ensure_comment_access(db, share, current_user)

    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    item = comment_service.add_reply(
        db, thread, current_user, payload,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return link_schema.CommentItemRead.model_validate(item)


@router.post("/comment-threads/{thread_id}/resolve", response_model=link_schema.CommentThreadRead)
def resolve_comment_thread(
    thread_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    thread = comment_service.get_thread(db, thread_id)
    share = get_share(db, thread.share_id)
    _ensure_comment_access(db, share, current_user)

    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    resolved = comment_service.resolve_thread(
        db, thread, current_user, ip_address=ip_address, user_agent=user_agent,
    )
    return link_schema.CommentThreadRead.model_validate(resolved)


@router.post("/comment-threads/{thread_id}/reopen", response_model=link_schema.CommentThreadRead)
def reopen_comment_thread(
    thread_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    thread = comment_service.get_thread(db, thread_id)
    share = get_share(db, thread.share_id)
    _ensure_comment_access(db, share, current_user)

    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    reopened = comment_service.reopen_thread(
        db, thread, current_user, ip_address=ip_address, user_agent=user_agent,
    )
    return link_schema.CommentThreadRead.model_validate(reopened)
