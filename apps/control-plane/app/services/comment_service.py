"""Service layer for comment threads and items."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db import models
from app.schemas import published_link as link_schema
from app.services import audit_service

logger = logging.getLogger(__name__)


def create_thread(
    db: Session,
    share: models.Share,
    user: models.User,
    payload: link_schema.CommentThreadCreate,
    published_link_id: uuid.UUID | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> models.CommentThread:
    thread = models.CommentThread(
        share_id=share.id,
        published_link_id=published_link_id,
        target_id=payload.target_id,
        anchor_type=payload.anchor_type,
        anchor_id=payload.anchor_id,
        status=models.CommentThreadStatus.OPEN,
        created_by=user.id,
    )
    db.add(thread)
    db.flush()

    first_item = models.CommentItem(
        thread_id=thread.id,
        body_markdown=payload.body,
        created_by=user.id,
    )
    db.add(first_item)

    audit_service.log_action(
        db=db,
        action=models.AuditAction.COMMENT_THREAD_CREATED,
        actor_user_id=user.id,
        target_share_id=share.id,
        details={
            "thread_id": str(thread.id),
            "target_id": payload.target_id,
            "anchor_type": payload.anchor_type.value,
        },
        ip_address=ip_address,
        user_agent=user_agent,
    )

    db.commit()
    db.refresh(thread)
    logger.info(
        "comment_thread.created thread_id=%s share_id=%s target_id=%s user=%s",
        thread.id, share.id, payload.target_id, user.id,
    )
    return thread


def add_reply(
    db: Session,
    thread: models.CommentThread,
    user: models.User,
    payload: link_schema.CommentReplyCreate,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> models.CommentItem:
    if thread.status == models.CommentThreadStatus.RESOLVED:
        thread.status = models.CommentThreadStatus.OPEN
        thread.resolved_by = None
        thread.resolved_at = None

    item = models.CommentItem(
        thread_id=thread.id,
        body_markdown=payload.body,
        created_by=user.id,
    )
    db.add(item)

    audit_service.log_action(
        db=db,
        action=models.AuditAction.COMMENT_REPLY_ADDED,
        actor_user_id=user.id,
        target_share_id=thread.share_id,
        details={"thread_id": str(thread.id)},
        ip_address=ip_address,
        user_agent=user_agent,
    )

    db.commit()
    db.refresh(item)
    logger.info("comment_reply.added thread_id=%s user=%s", thread.id, user.id)
    return item


def resolve_thread(
    db: Session,
    thread: models.CommentThread,
    user: models.User,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> models.CommentThread:
    if thread.status == models.CommentThreadStatus.RESOLVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Thread is already resolved"
        )

    thread.status = models.CommentThreadStatus.RESOLVED
    thread.resolved_by = user.id
    thread.resolved_at = datetime.now(timezone.utc)

    audit_service.log_action(
        db=db,
        action=models.AuditAction.COMMENT_THREAD_RESOLVED,
        actor_user_id=user.id,
        target_share_id=thread.share_id,
        details={"thread_id": str(thread.id)},
        ip_address=ip_address,
        user_agent=user_agent,
    )

    db.commit()
    db.refresh(thread)
    return thread


def reopen_thread(
    db: Session,
    thread: models.CommentThread,
    user: models.User,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> models.CommentThread:
    if thread.status == models.CommentThreadStatus.OPEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Thread is already open"
        )

    thread.status = models.CommentThreadStatus.OPEN
    thread.resolved_by = None
    thread.resolved_at = None

    audit_service.log_action(
        db=db,
        action=models.AuditAction.COMMENT_THREAD_REOPENED,
        actor_user_id=user.id,
        target_share_id=thread.share_id,
        details={"thread_id": str(thread.id)},
        ip_address=ip_address,
        user_agent=user_agent,
    )

    db.commit()
    db.refresh(thread)
    return thread


def get_thread(db: Session, thread_id: uuid.UUID) -> models.CommentThread:
    stmt = (
        select(models.CommentThread)
        .where(models.CommentThread.id == thread_id)
        .options(joinedload(models.CommentThread.items))
    )
    thread = db.execute(stmt).unique().scalar_one_or_none()
    if not thread:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Comment thread not found"
        )
    return thread


def list_threads(
    db: Session,
    share_id: uuid.UUID | None = None,
    target_id: str | None = None,
    published_link_id: uuid.UUID | None = None,
    include_resolved: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> list[models.CommentThread]:
    stmt = select(models.CommentThread).options(joinedload(models.CommentThread.items))

    if share_id:
        stmt = stmt.where(models.CommentThread.share_id == share_id)
    if target_id:
        stmt = stmt.where(models.CommentThread.target_id == target_id)
    if published_link_id:
        stmt = stmt.where(models.CommentThread.published_link_id == published_link_id)
    if not include_resolved:
        stmt = stmt.where(models.CommentThread.status == models.CommentThreadStatus.OPEN)

    stmt = stmt.order_by(models.CommentThread.created_at.desc()).offset(skip).limit(min(limit, 100))
    return list(db.execute(stmt).unique().scalars().all())
