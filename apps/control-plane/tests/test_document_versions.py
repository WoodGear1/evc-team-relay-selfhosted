from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.db import models


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _login(client: TestClient, email: str, password: str) -> str:
    response = client.post("/auth/login", json={"email": email, "password": password})
    return response.json()["access_token"]


def _create_version(
    client: TestClient,
    token: str,
    share_id: str,
    document_path: str,
    content: str,
) -> dict:
    response = client.post(
        f"/v1/document-versions/shares/{share_id}",
        json={"document_path": document_path, "content": content},
        headers=_auth_headers(token),
    )
    assert response.status_code == 201
    return response.json()


def _error_message(response) -> str:
    body = response.json()
    return body.get("detail", "") or body.get("error", {}).get("message", "")


def _create_share(db_session: Session, owner: models.User, path: str) -> models.Share:
    share = models.Share(
        kind=models.ShareKind.DOC,
        path=path,
        visibility=models.ShareVisibility.PUBLIC,
        owner_user_id=owner.id,
    )
    db_session.add(share)
    db_session.commit()
    db_session.refresh(share)
    return share


def test_diff_rejects_base_version_from_another_document(
    client: TestClient,
    db_session: Session,
):
    user = models.User(
        email="history@example.com",
        password_hash=get_password_hash("history123456"),
        is_admin=False,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    share = _create_share(db_session, user, "Docs/Primary.md")
    token = _login(client, user.email, "history123456")

    target_version = _create_version(
        client,
        token,
        str(share.id),
        "Docs/Primary.md",
        "# Primary\nbody",
    )
    other_version = _create_version(
        client,
        token,
        str(share.id),
        "Docs/Other.md",
        "# Other\nbody",
    )

    response = client.get(
        f"/v1/document-versions/{target_version['id']}/diff?base_version_id={other_version['id']}",
        headers=_auth_headers(token),
    )

    assert response.status_code == 400
    assert "same document" in _error_message(response).lower()


def test_diff_rejects_base_version_from_another_share(
    client: TestClient,
    db_session: Session,
):
    user = models.User(
        email="history-owner@example.com",
        password_hash=get_password_hash("history123456"),
        is_admin=False,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    first_share = _create_share(db_session, user, "Docs/One.md")
    second_share = _create_share(db_session, user, "Docs/Two.md")
    token = _login(client, user.email, "history123456")

    target_version = _create_version(
        client,
        token,
        str(first_share.id),
        "Docs/One.md",
        "# One\nbody",
    )
    other_version = _create_version(
        client,
        token,
        str(second_share.id),
        "Docs/Two.md",
        "# Two\nbody",
    )

    response = client.get(
        f"/v1/document-versions/{target_version['id']}/diff?base_version_id={other_version['id']}",
        headers=_auth_headers(token),
    )

    assert response.status_code == 400
    assert "same document" in _error_message(response).lower()
