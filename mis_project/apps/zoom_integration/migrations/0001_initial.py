from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("forms_builder", "0001_initial"),
        ("submissions", "0001_initial"),
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ZoomMeeting",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("zoom_meeting_id", models.CharField(max_length=64, unique=True)),
                ("topic", models.CharField(max_length=255)),
                ("join_url", models.URLField(blank=True)),
                ("start_url", models.URLField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("form", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="zoom_meeting",
                    to="forms_builder.form",
                )),
                ("created_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="zoom_meetings_created",
                    to="accounts.user",
                )),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="ZoomRegistrant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("registrant_id", models.CharField(blank=True, max_length=128)),
                ("join_url", models.URLField(blank=True)),
                ("status", models.CharField(
                    choices=[("registered", "Registered"), ("removed", "Removed"), ("failed", "Failed")],
                    default="registered",
                    max_length=20,
                )),
                ("error_message", models.TextField(blank=True)),
                ("registered_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("submission", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="zoom_registrant",
                    to="submissions.submission",
                )),
                ("zoom_meeting", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="registrants",
                    to="zoom_integration.zoommeeting",
                )),
            ],
            options={"ordering": ["-registered_at"]},
        ),
    ]
