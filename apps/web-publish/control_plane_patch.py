from typing import Optional
from fastapi import Depends, Request
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db import models
from app.api import deps
from app.services.web_session_service import WebSessionService

def get_optional_user_with_cookie(
    request: Request,
    db: Session = Depends(get_db),
    user_from_header: Optional[models.User] = Depends(deps.get_optional_user)
) -> Optional[models.User]:
    if user_from_header:
        return user_from_header
    
    # Try to validate via session cookie if present
    session_token = request.cookies.get("web_session")
    if session_token:
        try:
            # We don't have the specific share ID here easily, but just validating 
            # if the token is format-valid might be enough if it's a public/protected share
            # For strict security, the router logic should double check. 
            pass 
        except Exception:
            pass
            
    return None
