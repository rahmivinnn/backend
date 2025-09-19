# Higgs Domino Helm Chart

A comprehensive Helm chart for deploying the Higgs Domino full-stack application on Kubernetes.

## Overview

This Helm chart deploys a complete Higgs Domino gaming platform including:

- **Main Application**: Node.js backend with WebSocket support
- **Database**: PostgreSQL with persistent storage
- **Cache**: Redis for session management and caching
- **Monitoring**: Prometheus and Grafana for observability
- **Ingress**: Nginx Ingress Controller for external access
- **Autoscaling**: Horizontal Pod Autoscaler for dynamic scaling
- **Backup**: Automated database backups with CronJob
- **Security**: Network policies, RBAC, and security contexts

## Prerequisites

- Kubernetes 1.20+
- Helm 3.8+
- PV provisioner support in the underlying infrastructure
- Ingress controller (nginx recommended)
- Cert-manager (for TLS certificates)

## Installation

### Quick Start

```bash
# Add the Helm repository (if published)
helm repo add higgs-domino https://charts.higgs-domino.com
helm repo update

# Install with default values
helm install my-higgs-domino higgs-domino/higgs-domino
```

### Local Installation

```bash
# Clone the repository
git clone https://github.com/your-org/higgs-domino.git
cd higgs-domino/helm-chart

# Install dependencies
helm dependency update

# Install the chart
helm install my-higgs-domino . --namespace higgs-domino --create-namespace
```

### Production Installation

```bash
# Create production values file
cp values.yaml values-production.yaml

# Edit production values
vim values-production.yaml

# Install with production values
helm install higgs-domino . \
  --namespace higgs-domino \
  --create-namespace \
  --values values-production.yaml
```

## Configuration

### Key Configuration Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `app.image.repository` | Application image repository | `higgs-domino/app` |
| `app.image.tag` | Application image tag | `latest` |
| `app.replicaCount` | Number of application replicas | `3` |
| `app.env` | Environment (development/staging/production) | `development` |
| `app.ingress.enabled` | Enable ingress | `true` |
| `app.ingress.hosts[0].host` | Ingress hostname | `higgs-domino.local` |
| `postgresql.enabled` | Enable PostgreSQL | `true` |
| `redis.enabled` | Enable Redis | `true` |
| `prometheus.enabled` | Enable Prometheus | `true` |
| `grafana.enabled` | Enable Grafana | `true` |

### Environment-Specific Configurations

#### Development
```yaml
app:
  env: development
  replicaCount: 1
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
  config:
    logLevel: debug
    metricsEnabled: true
```

#### Staging
```yaml
app:
  env: staging
  replicaCount: 2
  resources:
    requests:
      cpu: 200m
      memory: 512Mi
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 5
```

#### Production
```yaml
app:
  env: production
  replicaCount: 3
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 1000m
      memory: 2Gi
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
  backup:
    enabled: true
    schedule: "0 2 * * *"
  networkPolicy:
    enabled: true
```

### Database Configuration

#### Internal PostgreSQL
```yaml
postgresql:
  enabled: true
  auth:
    postgresPassword: "your-postgres-password"
    username: "higgs_domino"
    password: "your-db-password"
    database: "higgs_domino"
  primary:
    persistence:
      enabled: true
      size: 20Gi
```

#### External PostgreSQL
```yaml
postgresql:
  enabled: false

externalDatabase:
  host: "postgres.example.com"
  port: 5432
  username: "higgs_domino"
  database: "higgs_domino"
  password: "your-external-db-password"
```

### Redis Configuration

#### Internal Redis
```yaml
redis:
  enabled: true
  auth:
    enabled: true
    password: "your-redis-password"
  master:
    persistence:
      enabled: true
      size: 8Gi
```

#### External Redis
```yaml
redis:
  enabled: false

externalRedis:
  host: "redis.example.com"
  port: 6379
  password: "your-external-redis-password"
```

### Ingress Configuration

```yaml
app:
  ingress:
    enabled: true
    className: "nginx"
    annotations:
      cert-manager.io/cluster-issuer: "letsencrypt-prod"
      nginx.ingress.kubernetes.io/rate-limit: "100"
    hosts:
      - host: higgs-domino.example.com
        paths:
          - path: /
            pathType: Prefix
      - host: api.higgs-domino.example.com
        paths:
          - path: /api
            pathType: Prefix
    tls:
      - secretName: higgs-domino-tls
        hosts:
          - higgs-domino.example.com
          - api.higgs-domino.example.com
```

### Monitoring Configuration

```yaml
prometheus:
  enabled: true
  server:
    persistentVolume:
      enabled: true
      size: 10Gi

grafana:
  enabled: true
  persistence:
    enabled: true
    size: 5Gi
  adminPassword: "your-grafana-password"

app:
  serviceMonitor:
    enabled: true
    interval: 30s
    path: /metrics
```

### Backup Configuration

```yaml
app:
  backup:
    enabled: true
    schedule: "0 2 * * *"  # Daily at 2 AM
    retention:
      days: 7
    persistence:
      enabled: true
      size: 50Gi
    s3:
      enabled: true
      bucket: "higgs-domino-backups"
      region: "us-east-1"
      prefix: "backups"
```

## Secrets Management

### Required Secrets

The following secrets must be configured:

```yaml
app:
  secrets:
    databasePassword: "your-db-password"
    redisPassword: "your-redis-password"
    jwtSecret: "your-jwt-secret"
    stripeSecretKey: "sk_live_..."
    paypalClientSecret: "your-paypal-secret"
    emailPassword: "your-email-password"
    firebasePrivateKey: "your-firebase-key"
```

### Using External Secrets

```yaml
app:
  externalSecrets:
    enabled: true
    secretStore:
      name: "vault-backend"
      kind: "SecretStore"
    data:
      - secretKey: "database-password"
        remoteRef:
          key: "higgs-domino/database"
          property: "password"
```

## Deployment Strategies

### Rolling Update (Default)
```yaml
app:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
```

### Blue-Green Deployment
```yaml
app:
  strategy:
    type: Recreate
  # Use separate ingress for blue-green
```

### Canary Deployment
```yaml
app:
  # Use Istio or Flagger for canary deployments
  istio:
    enabled: true
    virtualService:
      enabled: true
    destinationRule:
      enabled: true
```

## Scaling

### Manual Scaling
```bash
# Scale to 5 replicas
kubectl scale deployment higgs-domino --replicas=5

# Or using Helm
helm upgrade higgs-domino . --set app.replicaCount=5
```

### Auto Scaling
```yaml
app:
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70
    targetMemoryUtilizationPercentage: 80
```

## Monitoring and Observability

### Prometheus Metrics

The application exposes metrics at `/metrics` endpoint:

- HTTP request duration and count
- WebSocket connections
- Database connection pool
- Redis operations
- Custom business metrics

### Grafana Dashboards

Pre-configured dashboards include:

- Application Overview
- Database Performance
- Redis Metrics
- Infrastructure Metrics
- Business Metrics

### Logging

```yaml
app:
  logging:
    level: info
    format: json
  fluentd:
    enabled: true
    elasticsearch:
      host: "elasticsearch.logging.svc.cluster.local"
```

## Security

### Network Policies

```yaml
app:
  networkPolicy:
    enabled: true
    ingress:
      - from:
          - namespaceSelector:
              matchLabels:
                name: ingress-nginx
    egress:
      - to: []
        ports:
          - protocol: TCP
            port: 443  # HTTPS
          - protocol: TCP
            port: 53   # DNS
```

### Pod Security

```yaml
app:
  podSecurityContext:
    runAsNonRoot: true
    runAsUser: 1001
    fsGroup: 1001
  securityContext:
    allowPrivilegeEscalation: false
    readOnlyRootFilesystem: true
    capabilities:
      drop:
        - ALL
```

### RBAC

```yaml
app:
  serviceAccount:
    create: true
    name: "higgs-domino"
  rbac:
    create: true
    rules:
      - apiGroups: [""]
        resources: ["configmaps"]
        verbs: ["get", "list"]
```

## Backup and Recovery

### Database Backup

```bash
# Manual backup
kubectl create job --from=cronjob/higgs-domino-backup manual-backup-$(date +%Y%m%d-%H%M%S)

# Restore from backup
kubectl run restore-job --image=postgres:15-alpine --rm -it --restart=Never -- \
  pg_restore -h postgres-service -U higgs_domino -d higgs_domino /backup/backup.sql.gz
```

### Disaster Recovery

1. **Data Backup**: Automated daily backups to S3
2. **Configuration Backup**: Helm values and secrets
3. **Recovery Procedure**: Documented step-by-step process

## Troubleshooting

### Common Issues

#### Application Won't Start
```bash
# Check pod status
kubectl get pods -l app.kubernetes.io/name=higgs-domino

# Check logs
kubectl logs -l app.kubernetes.io/name=higgs-domino --tail=100

# Check events
kubectl get events --sort-by=.metadata.creationTimestamp
```

#### Database Connection Issues
```bash
# Test database connectivity
kubectl run db-test --image=postgres:15-alpine --rm -it --restart=Never -- \
  pg_isready -h postgres-service -p 5432

# Check database logs
kubectl logs -l app.kubernetes.io/name=postgresql
```

#### Performance Issues
```bash
# Check resource usage
kubectl top pods -l app.kubernetes.io/name=higgs-domino

# Check HPA status
kubectl get hpa

# Check metrics
kubectl port-forward svc/prometheus-server 9090:80
# Visit http://localhost:9090
```

### Debug Mode

```yaml
app:
  config:
    logLevel: debug
    debugMode: true
  resources:
    limits:
      cpu: 2000m
      memory: 4Gi
```

## Testing

### Helm Tests

```bash
# Run all tests
helm test higgs-domino

# Run specific test
kubectl get pods -l app.kubernetes.io/component=test
```

### Load Testing

```bash
# Install k6
kubectl apply -f https://raw.githubusercontent.com/grafana/k6-operator/main/bundle.yaml

# Run load test
kubectl apply -f tests/load-test.yaml
```

## Upgrading

### Helm Upgrade

```bash
# Upgrade to new version
helm upgrade higgs-domino . --values values-production.yaml

# Rollback if needed
helm rollback higgs-domino 1
```

### Database Migrations

Migrations run automatically as Helm hooks:

```yaml
app:
  migration:
    enabled: true
    image:
      repository: higgs-domino/app
      tag: latest
```

## Uninstallation

```bash
# Uninstall the release
helm uninstall higgs-domino

# Clean up PVCs (if needed)
kubectl delete pvc -l app.kubernetes.io/instance=higgs-domino

# Clean up namespace
kubectl delete namespace higgs-domino
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

- **Documentation**: https://docs.higgs-domino.com
- **Issues**: https://github.com/your-org/higgs-domino/issues
- **Discussions**: https://github.com/your-org/higgs-domino/discussions
- **Email**: support@higgs-domino.com

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.