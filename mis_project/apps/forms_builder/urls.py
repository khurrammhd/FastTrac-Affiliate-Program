from django.urls import path
from .views import (
    FormListCreateView, FormDetailView,
    FormPublishView, FormCloseView,
    FormFieldListCreateView, FormFieldDetailView,
    FormVersionListView, FormVersionRestoreView,
    PublicFormView,
)

urlpatterns = [
    path("",                                        FormListCreateView.as_view(),     name="form_list"),
    path("<int:pk>/",                               FormDetailView.as_view(),         name="form_detail"),
    path("<int:pk>/publish/",                       FormPublishView.as_view(),        name="form_publish"),
    path("<int:pk>/close/",                         FormCloseView.as_view(),          name="form_close"),
    path("<int:form_pk>/fields/",                   FormFieldListCreateView.as_view(), name="field_list"),
    path("<int:form_pk>/fields/<int:pk>/",          FormFieldDetailView.as_view(),    name="field_detail"),
    path("<int:form_pk>/versions/",                 FormVersionListView.as_view(),    name="form_versions"),
    path("<int:form_pk>/versions/<int:version_pk>/restore/", FormVersionRestoreView.as_view(), name="form_version_restore"),
    path("public/<uuid:token>/",                    PublicFormView.as_view(),          name="public_form"),
]
