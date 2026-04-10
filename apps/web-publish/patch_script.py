def _ensure_share_access_optional(db: Session, share: models.Share, user: models.User | None) -> None:
    if share.visibility == models.ShareVisibility.PUBLIC:
        return
    if user:
        if user.is_admin or share.owner_user_id == user.id:
            return
        if _get_member(db, share.id, user.id):
            return
    from fastapi import HTTPException
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=\
Access
to
this
share
is
required\)
