from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("forms_builder", "0002_extend_field_types"),
    ]

    operations = [
        migrations.AddField(
            model_name="form",
            name="enable_captcha",
            field=models.BooleanField(default=False),
        ),
    ]