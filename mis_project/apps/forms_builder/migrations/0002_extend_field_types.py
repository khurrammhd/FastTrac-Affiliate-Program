from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Extends FormField.field_type choices to cover the full palette exposed
    by the React FormBuilder:

      - password, url                 (text inputs)
      - range, time, datetime-local   (numeric / date / time)
      - color, hidden                 (special)
      - heading, paragraph, divider   (layout blocks — display only)

    No data migration is needed; the column is still a CharField(max_length=20)
    and existing rows continue to use the original ten choices. Only the
    validation allow-list is widened.
    """

    dependencies = [
        ("forms_builder", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="formfield",
            name="field_type",
            field=models.CharField(
                max_length=20,
                choices=[
                    # Text inputs
                    ("text",           "Short text"),
                    ("textarea",       "Long text"),
                    ("email",          "Email"),
                    ("phone",          "Phone number"),
                    ("password",       "Password"),
                    ("url",            "URL"),
                    # Numeric / date / time
                    ("number",         "Number"),
                    ("range",          "Slider"),
                    ("date",           "Date"),
                    ("time",           "Time"),
                    ("datetime-local", "Date & time"),
                    # Choice
                    ("select",         "Dropdown"),
                    ("radio",          "Radio buttons"),
                    ("checkbox",       "Checkboxes"),
                    # Special
                    ("color",          "Color picker"),
                    ("file",           "File upload"),
                    ("hidden",         "Hidden field"),
                    # Layout blocks
                    ("heading",        "Section heading"),
                    ("paragraph",      "Paragraph"),
                    ("divider",        "Divider"),
                ],
            ),
        ),
    ]
