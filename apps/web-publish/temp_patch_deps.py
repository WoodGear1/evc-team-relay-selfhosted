import re\nwith open('document_versions_new.py', 'r') as f:\n    content = f.read()\n\ncontent = content.replace('def get_optional_user(', 'def get_optional_user_cookie_auth(')\n\n
