{{/*
Expand the name of the chart.
*/}}
{{- define "higgs-domino.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "higgs-domino.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "higgs-domino.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "higgs-domino.labels" -}}
helm.sh/chart: {{ include "higgs-domino.chart" . }}
{{ include "higgs-domino.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: higgs-domino
app.kubernetes.io/component: backend
{{- end }}

{{/*
Selector labels
*/}}
{{- define "higgs-domino.selectorLabels" -}}
app.kubernetes.io/name: {{ include "higgs-domino.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "higgs-domino.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "higgs-domino.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the secret to use
*/}}
{{- define "higgs-domino.secretName" -}}
{{- printf "%s-secrets" (include "higgs-domino.fullname" .) }}
{{- end }}

{{/*
PostgreSQL host
*/}}
{{- define "higgs-domino.postgresql.host" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "%s-postgresql" .Release.Name }}
{{- else }}
{{- .Values.externalDatabase.host }}
{{- end }}
{{- end }}

{{/*
PostgreSQL port
*/}}
{{- define "higgs-domino.postgresql.port" -}}
{{- if .Values.postgresql.enabled }}
{{- .Values.postgresql.primary.service.ports.postgresql | default 5432 }}
{{- else }}
{{- .Values.externalDatabase.port | default 5432 }}
{{- end }}
{{- end }}

{{/*
PostgreSQL database name
*/}}
{{- define "higgs-domino.postgresql.database" -}}
{{- if .Values.postgresql.enabled }}
{{- .Values.postgresql.auth.database }}
{{- else }}
{{- .Values.externalDatabase.database }}
{{- end }}
{{- end }}

{{/*
PostgreSQL username
*/}}
{{- define "higgs-domino.postgresql.username" -}}
{{- if .Values.postgresql.enabled }}
{{- .Values.postgresql.auth.username }}
{{- else }}
{{- .Values.externalDatabase.username }}
{{- end }}
{{- end }}

{{/*
PostgreSQL password
*/}}
{{- define "higgs-domino.postgresql.password" -}}
{{- if .Values.postgresql.enabled }}
{{- .Values.postgresql.auth.password }}
{{- else }}
{{- .Values.externalDatabase.password }}
{{- end }}
{{- end }}

{{/*
Redis host
*/}}
{{- define "higgs-domino.redis.host" -}}
{{- if .Values.redis.enabled }}
{{- printf "%s-redis-master" .Release.Name }}
{{- else }}
{{- .Values.externalRedis.host }}
{{- end }}
{{- end }}

{{/*
Redis port
*/}}
{{- define "higgs-domino.redis.port" -}}
{{- if .Values.redis.enabled }}
{{- .Values.redis.master.service.ports.redis | default 6379 }}
{{- else }}
{{- .Values.externalRedis.port | default 6379 }}
{{- end }}
{{- end }}

{{/*
Redis password
*/}}
{{- define "higgs-domino.redis.password" -}}
{{- if .Values.redis.enabled }}
{{- .Values.redis.auth.password }}
{{- else }}
{{- .Values.externalRedis.password }}
{{- end }}
{{- end }}

{{/*
Prometheus server URL
*/}}
{{- define "higgs-domino.prometheus.url" -}}
{{- if .Values.prometheus.enabled }}
{{- printf "http://%s-prometheus-server" .Release.Name }}
{{- else }}
{{- .Values.externalPrometheus.url }}
{{- end }}
{{- end }}

{{/*
Grafana URL
*/}}
{{- define "higgs-domino.grafana.url" -}}
{{- if .Values.grafana.enabled }}
{{- printf "http://%s-grafana" .Release.Name }}
{{- else }}
{{- .Values.externalGrafana.url }}
{{- end }}
{{- end }}

{{/*
Create image pull secret
*/}}
{{- define "higgs-domino.imagePullSecret" -}}
{{- with .Values.app.image.pullSecrets }}
imagePullSecrets:
{{- range . }}
  - name: {{ . }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Generate certificates
*/}}
{{- define "higgs-domino.gen-certs" -}}
{{- $altNames := list ( printf "%s.%s" (include "higgs-domino.fullname" .) .Release.Namespace ) ( printf "%s.%s.svc" (include "higgs-domino.fullname" .) .Release.Namespace ) -}}
{{- $ca := genCA "higgs-domino-ca" 365 -}}
{{- $cert := genSignedCert ( include "higgs-domino.fullname" . ) nil $altNames 365 $ca -}}
tls.crt: {{ $cert.Cert | b64enc }}
tls.key: {{ $cert.Key | b64enc }}
{{- end }}

{{/*
Validate configuration
*/}}
{{- define "higgs-domino.validateConfig" -}}
{{- if and .Values.app.ingress.enabled (not .Values.app.ingress.hosts) }}
{{- fail "Ingress is enabled but no hosts are configured" }}
{{- end }}
{{- if and .Values.app.autoscaling.enabled (lt (.Values.app.autoscaling.minReplicas | int) 1) }}
{{- fail "Autoscaling minReplicas must be at least 1" }}
{{- end }}
{{- if and .Values.app.autoscaling.enabled (gt (.Values.app.autoscaling.minReplicas | int) (.Values.app.autoscaling.maxReplicas | int)) }}
{{- fail "Autoscaling minReplicas cannot be greater than maxReplicas" }}
{{- end }}
{{- if and (not .Values.postgresql.enabled) (not .Values.externalDatabase.host) }}
{{- fail "Either postgresql.enabled must be true or externalDatabase.host must be set" }}
{{- end }}
{{- if and (not .Values.redis.enabled) (not .Values.externalRedis.host) }}
{{- fail "Either redis.enabled must be true or externalRedis.host must be set" }}
{{- end }}
{{- end }}

{{/*
Resource name with namespace
*/}}
{{- define "higgs-domino.resourceName" -}}
{{- printf "%s.%s" .name .namespace -}}
{{- end }}

{{/*
Common annotations
*/}}
{{- define "higgs-domino.annotations" -}}
meta.helm.sh/release-name: {{ .Release.Name }}
meta.helm.sh/release-namespace: {{ .Release.Namespace }}
{{- if .Values.commonAnnotations }}
{{- toYaml .Values.commonAnnotations }}
{{- end }}
{{- end }}

{{/*
Pod annotations
*/}}
{{- define "higgs-domino.podAnnotations" -}}
{{- if .Values.app.podAnnotations }}
{{- toYaml .Values.app.podAnnotations }}
{{- end }}
{{- end }}

{{/*
Storage class
*/}}
{{- define "higgs-domino.storageClass" -}}
{{- if .Values.global.storageClass }}
{{- .Values.global.storageClass }}
{{- else if .storageClass }}
{{- .storageClass }}
{{- else }}
{{- "" }}
{{- end }}
{{- end }}

{{/*
Image registry
*/}}
{{- define "higgs-domino.imageRegistry" -}}
{{- if .Values.global.imageRegistry }}
{{- .Values.global.imageRegistry }}
{{- else }}
{{- .Values.app.image.registry }}
{{- end }}
{{- end }}

{{/*
Full image name
*/}}
{{- define "higgs-domino.image" -}}
{{- $registry := include "higgs-domino.imageRegistry" . }}
{{- $repository := .Values.app.image.repository }}
{{- $tag := .Values.app.image.tag | default .Chart.AppVersion }}
{{- if $registry }}
{{- printf "%s/%s:%s" $registry $repository $tag }}
{{- else }}
{{- printf "%s:%s" $repository $tag }}
{{- end }}
{{- end }}

{{/*
Environment name
*/}}
{{- define "higgs-domino.environment" -}}
{{- .Values.app.env.NODE_ENV | default "production" }}
{{- end }}

{{/*
Is production environment
*/}}
{{- define "higgs-domino.isProduction" -}}
{{- eq (include "higgs-domino.environment" .) "production" }}
{{- end }}

{{/*
Is development environment
*/}}
{{- define "higgs-domino.isDevelopment" -}}
{{- eq (include "higgs-domino.environment" .) "development" }}
{{- end }}

{{/*
Network policy labels
*/}}
{{- define "higgs-domino.networkPolicyLabels" -}}
app.kubernetes.io/name: {{ include "higgs-domino.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}