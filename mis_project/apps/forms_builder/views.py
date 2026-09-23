from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import CanManageForms, IsReviewerOrAbove
from .models import Form, FormField, FormConfigurationList, FormGroup
from .serializers import (
    FormSerializer,
    FormWriteSerializer,
    FormFieldSerializer,
    PublicFormSerializer,
    FormConfigurationListSerializer,
    FormGroupSerializer,
)

class FormListCreateView(generics.ListCreateAPIView):
    queryset = Form.objects.order_by("-updated_at", "-created_at")

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.IsAuthenticated(), IsReviewerOrAbove()]
        return [permissions.IsAuthenticated(), CanManageForms()]

    def get_serializer_class(self):
        return FormWriteSerializer if self.request.method == "POST" else FormSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class FormDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Form.objects.all()

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.IsAuthenticated(), IsReviewerOrAbove()]
        return [permissions.IsAuthenticated(), CanManageForms()]

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return FormWriteSerializer
        return FormSerializer


class FormPublishView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageForms]

    def post(self, request, pk):
        try:
            form = Form.objects.get(pk=pk)
        except Form.DoesNotExist:
            return Response({"error": "Form not found."}, status=404)
        form.status = Form.Status.PUBLISHED
        form.published_at = timezone.now()
        form.save()
        return Response(FormSerializer(form).data)


class FormCloseView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageForms]

    def post(self, request, pk):
        try:
            form = Form.objects.get(pk=pk)
        except Form.DoesNotExist:
            return Response({"error": "Form not found."}, status=404)
        form.status = Form.Status.CLOSED
        form.save()
        return Response(FormSerializer(form).data)


class FormCloneView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanManageForms]

    def post(self, request, pk):
        try:
            original = Form.objects.get(pk=pk)
        except Form.DoesNotExist:
            return Response({"error": "Form not found."}, status=404)

        # Build a unique slug: "<original-slug>-copy", then "-copy-2", "-copy-3", …
        base_slug = f"{original.slug}-copy"
        candidate = base_slug
        counter = 2
        while Form.objects.filter(slug=candidate).exists():
            candidate = f"{base_slug}-{counter}"
            counter += 1

        clone = Form.objects.create(
            title=f"Copy of {original.title}",
            description=original.description,
            slug=candidate,
            status=Form.Status.DRAFT,
            enable_captcha=original.enable_captcha,
            canvas_course_id=original.canvas_course_id,
            canvas_course_name=original.canvas_course_name,
            created_by=request.user,
        )

        # Copy all fields
        for field in original.fields.order_by("order"):
            FormField.objects.create(
                form=clone,
                label=field.label,
                field_type=field.field_type,
                placeholder=field.placeholder,
                help_text=field.help_text,
                is_required=field.is_required,
                order=field.order,
                field_options=field.field_options,
                canvas_field_mapping=field.canvas_field_mapping,
                global_list=field.global_list,
            )

        return Response(FormSerializer(clone).data, status=status.HTTP_201_CREATED)


class FormFieldListCreateView(generics.ListCreateAPIView):
    serializer_class = FormFieldSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.IsAuthenticated(), IsReviewerOrAbove()]
        return [permissions.IsAuthenticated(), CanManageForms()]

    def get_queryset(self):
        return FormField.objects.filter(form_id=self.kwargs["form_pk"])

    def perform_create(self, serializer):
        form = Form.objects.get(pk=self.kwargs["form_pk"])
        serializer.save(form=form)


class FormFieldDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FormFieldSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.IsAuthenticated(), IsReviewerOrAbove()]
        return [permissions.IsAuthenticated(), CanManageForms()]

    def get_queryset(self):
        return FormField.objects.filter(form_id=self.kwargs["form_pk"])


class FormConfigurationListCreateView(generics.ListCreateAPIView):
    serializer_class = FormConfigurationListSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.IsAuthenticated(), IsReviewerOrAbove()]
        return [permissions.IsAuthenticated(), CanManageForms()]

    def get_queryset(self):
        return FormConfigurationList.objects.order_by("name")


class FormConfigurationDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FormConfigurationListSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.IsAuthenticated(), IsReviewerOrAbove()]
        return [permissions.IsAuthenticated(), CanManageForms()]

    def get_queryset(self):
        return FormConfigurationList.objects.all()


# ── Public (no auth) ──────────────────────────────────────────────────────

class PublicFormView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        now = timezone.now()
        try:
            form = Form.objects.get(public_token=token, status=Form.Status.PUBLISHED)
        except Form.DoesNotExist:
            return Response({"error": "Form not found or not available."}, status=404)
        if form.closes_at and now > form.closes_at:
            return Response({"error": "This form is closed."}, status=410)
        return Response(PublicFormSerializer(form).data)


# ── Form versioning ───────────────────────────────────────────────────────

from .models import FormVersion
from rest_framework import serializers as drf_serializers


class FormVersionListView(generics.ListAPIView):
    """List all saved versions of a form."""
    permission_classes = [permissions.IsAuthenticated, IsReviewerOrAbove]

    class _Serializer(drf_serializers.ModelSerializer):
        created_by_name = drf_serializers.SerializerMethodField()
        class Meta:
            from .models import FormVersion
            model = FormVersion
            fields = ["id", "version", "schema", "note", "created_by_name", "created_at"]
        def get_created_by_name(self, obj):
            return obj.created_by.get_full_name() if obj.created_by else None

    serializer_class = _Serializer

    def get_queryset(self):
        return FormVersion.objects.filter(form_id=self.kwargs["form_pk"])


class FormVersionRestoreView(APIView):
    """Restore a form's fields to a specific version."""
    permission_classes = [permissions.IsAuthenticated, CanManageForms]

    def post(self, request, form_pk, version_pk):
        try:
            version = FormVersion.objects.get(pk=version_pk, form_id=form_pk)
            form    = Form.objects.get(pk=form_pk)
        except (FormVersion.DoesNotExist, Form.DoesNotExist):
            return Response({"error": "Not found."}, status=404)

        from .models import FormField
        form.fields.all().delete()
        for field_data in version.schema:
            FormField.objects.create(form=form, **{
                k: v for k, v in field_data.items()
                if k not in ("id", "form")
            })
        return Response(FormSerializer(form).data)


class FormGroupListCreateView(generics.ListCreateAPIView):
    queryset = FormGroup.objects.all()
    serializer_class = FormGroupSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.IsAuthenticated(), IsReviewerOrAbove()]
        return [permissions.IsAuthenticated(), CanManageForms()]


class FormGroupDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = FormGroup.objects.all()
    serializer_class = FormGroupSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.IsAuthenticated(), IsReviewerOrAbove()]
        return [permissions.IsAuthenticated(), CanManageForms()]
