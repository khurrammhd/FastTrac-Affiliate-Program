import uuid
from django.db import models
from django.conf import settings


class FormGroup(models.Model):
    """A named group that forms can be organised into."""
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="form_groups_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Form(models.Model):
    """
    A form definition created by an admin.
    Each form gets a unique public slug for the public registration URL.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        CLOSED = "closed", "Closed"

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    slug = models.SlugField(unique=True, max_length=80)
    public_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    enable_captcha = models.BooleanField(default=False)

    # Optional: organise forms into a group
    group = models.ForeignKey(
        FormGroup,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="forms",
    )

    # Optional: link form submissions to a Canvas course for auto-enroll
    canvas_course_id = models.CharField(max_length=64, blank=True, null=True)
    canvas_course_name = models.CharField(max_length=255, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="forms_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    published_at = models.DateTimeField(null=True, blank=True)
    closes_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} [{self.status}]"

    @property
    def public_url(self):
        return f"/f/{self.public_token}/"


class FormConfigurationList(models.Model):
    """
    Reusable global option lists that can be attached to choice fields.
    """

    name = models.CharField(max_length=120, unique=True)
    options = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="form_config_lists_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="form_config_lists_updated",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class FormField(models.Model):
    """
    A single field within a Form. Fields are ordered by `order`.
    field_options stores choices for select/radio/checkbox as JSON list.
    """

    class FieldType(models.TextChoices):
        # Text inputs
        TEXT     = "text",     "Short text"
        TEXTAREA = "textarea", "Long text"
        EMAIL    = "email",    "Email"
        PHONE    = "phone",    "Phone number"
        PASSWORD = "password", "Password"
        URL      = "url",      "URL"
        # Numeric / date / time
        NUMBER         = "number",         "Number"
        RANGE          = "range",          "Slider"
        DATE           = "date",           "Date"
        TIME           = "time",           "Time"
        DATETIME_LOCAL = "datetime-local", "Date & time"
        # Choice
        SELECT   = "select",   "Dropdown"
        RADIO    = "radio",    "Radio buttons"
        CHECKBOX = "checkbox", "Checkboxes"
        # Special
        COLOR  = "color",  "Color picker"
        FILE   = "file",   "File upload"
        HIDDEN = "hidden", "Hidden field"
        # Layout blocks (display only — not collected as submission answers)
        HEADING   = "heading",   "Section heading"
        PARAGRAPH = "paragraph", "Paragraph"
        DIVIDER   = "divider",   "Divider"

    form = models.ForeignKey(Form, on_delete=models.CASCADE, related_name="fields")
    label = models.CharField(max_length=255)
    field_type = models.CharField(max_length=20, choices=FieldType.choices)
    placeholder = models.CharField(max_length=255, blank=True)
    help_text = models.CharField(max_length=500, blank=True)
    is_required = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    # JSON list of strings for select/radio/checkbox
    field_options = models.JSONField(default=list, blank=True)

    # Optional reusable source for choice options
    global_list = models.ForeignKey(
        FormConfigurationList,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="fields",
    )

    # Maps this field to a Canvas user attribute (e.g. "name", "email")
    canvas_field_mapping = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.form.title} \u2192 {self.label} ({self.field_type})"


class FormVersion(models.Model):
    """
    Immutable snapshot of a Form's field schema.
    Created automatically every time a published form is saved.
    """
    form       = models.ForeignKey(Form, on_delete=models.CASCADE, related_name="versions")
    version    = models.PositiveIntegerField()
    schema     = models.JSONField(help_text="Full snapshot of fields at this point in time")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL
    )
    created_at = models.DateTimeField(auto_now_add=True)
    note       = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-version"]
        unique_together = [("form", "version")]

    def __str__(self):
        return f"{self.form.title} v{self.version}"


from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender=Form)
def snapshot_form_version(sender, instance, **kwargs):
    """
    After every Form save, create a new FormVersion snapshot.
    We import here to avoid circular imports.
    """
    from apps.forms_builder.serializers import FormFieldSerializer
    fields_data = FormFieldSerializer(instance.fields.all(), many=True).data
    last = FormVersion.objects.filter(form=instance).order_by("-version").first()
    next_version = (last.version + 1) if last else 1
    FormVersion.objects.create(
        form=instance,
        version=next_version,
        schema=list(fields_data),
    )
