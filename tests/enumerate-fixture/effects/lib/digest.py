from django.core.mail import send_mail


def digest(user):
    send_mail("Your digest", "...", "noreply@digest.invalid", [user.email])
