import re
with open('document_versions_patched.py', 'r') as f:
    content = f.read()

old_func = '''def _ensure_share_access(db: Session, share: models.Share, user: models.User) -> None:
    if user.is_admin or share.owner_user_id == user.id:
        return
    if _get_member(db, share.id, user.id):
        return
    from fastapi import HTTPException

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to this share is required")'''

new_func = '''def _ensure_share_access(db: Session, share: models.Share, user: models.User | None) -> None:
    if share.visibility == models.ShareVisibility.PUBLIC:
        return
    if user:
        if user.is_admin or share.owner_user_id == user.id:
            return
        if _get_member(db, share.id, user.id):
            return
    from fastapi import HTTPException

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to this share is required")'''

content = content.replace(old_func, new_func)

content = content.replace('current_user: models.User = Depends(deps.get_current_user)', 'current_user: models.User | None = Depends(deps.get_optional_user)')

with open('document_versions_new.py', 'w') as f:
    f.write(content)
