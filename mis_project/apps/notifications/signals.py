from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender="submissions.Submission")
def create_submission_notifications(sender, instance, created, **kwargs):
    if not created:
        return

    from apps.accounts.models import User
    from apps.notifications.models import Notification

    submitter = (instance.submitter_name or "Someone").strip()
    form_title = instance.form.title if instance.form_id else "a form"
    course_name = (instance.form.canvas_course_name or "").strip() if instance.form_id else ""

    if course_name:
        message = f'{submitter} submitted \u201c{form_title}\u201d for course \u201c{course_name}\u201d'
    else:
        message = f'{submitter} submitted \u201c{form_title}\u201d'

    recipient_ids = list(
        User.objects.filter(role__in=["admin", "superadmin", "reviewer"])
        .values_list("id", flat=True)
    )

    if not recipient_ids:
        return

    Notification.objects.bulk_create([
        Notification(
            recipient_id=uid,
            notification_type=Notification.Type.NEW_SUBMISSION,
            title="New submission received",
            message=message,
            submission=instance,
        )
        for uid in recipient_ids
    ])
