import json
import os
import smtplib
from email.message import EmailMessage
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
brief = json.loads((ROOT / "data" / "latest.json").read_text(encoding="utf-8"))
newsletter_path = ROOT / "newsletters" / f"{brief['date']}.md"
newsletter = newsletter_path.read_text(encoding="utf-8")

required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "NEWSLETTER_FROM", "NEWSLETTER_TO"]
missing = [name for name in required if not os.getenv(name)]
if missing:
    raise SystemExit(f"Missing environment variables: {', '.join(missing)}")

message = EmailMessage()
message["Subject"] = f"岚序财经｜Lanxu Finance｜{brief['date']}"
message["From"] = os.environ["NEWSLETTER_FROM"]
message["To"] = os.environ["NEWSLETTER_TO"]
message.set_content(newsletter)

host = os.environ["SMTP_HOST"]
port = int(os.environ["SMTP_PORT"])

with smtplib.SMTP_SSL(host, port) if port == 465 else smtplib.SMTP(host, port) as smtp:
    if port != 465:
        smtp.starttls()
    smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
    smtp.send_message(message)

print("Email sent")
