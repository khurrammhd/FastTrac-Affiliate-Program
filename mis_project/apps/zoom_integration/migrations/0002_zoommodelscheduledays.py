from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("zoom_integration", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="zoommeeting",
            name="schedule_days",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
