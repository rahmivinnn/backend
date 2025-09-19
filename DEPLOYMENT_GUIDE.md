# Higgs Domino Deployment Guide

Comprehensive guide for deploying the Higgs Domino gaming platform across different environments.

## 📋 Prerequisites

### System Requirements

#### Minimum Requirements
- **CPU**: 2 cores
- **Memory**: 4GB RAM
- **Storage**: 20GB available space
- **Network**: Stable internet connection

#### Recommended Requirements
- **CPU**: 4+ cores
- **Memory**: 8GB+ RAM
- **Storage**: 50GB+ SSD
- **Network**: High-speed internet with low latency

### Software Dependencies

#### Local Development
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **PostgreSQL**: 13+ (if running locally)
- **Redis**: 6.0+ (if running locally)

#### Kubernetes Deployment
- **Kubernetes**: 1.20+
- **Helm**: 3.7+
- **kubectl**: Compatible with cluster version
- **Container Registry**: Docker Hub, ECR, GCR, etc.

#### Database Management
- **PostgreSQL Client**: psql 13+
- **Database Admin Tool**: pgAdmin, DBeaver (optional)

## 🐳 Docker Development Setup

### Quick Start

1. **Clone and Navigate**
   ```bash
   cd c:\Users\Lenovo\Downloads\DB
   ```

2. **Start Services**
   ```bash
   docker-compose up -d
   ```

3. **Verify Deployment**
   ```bash
   docker-compose ps
   docker-compose logs -f app
   ```

4. **Access Services**
   - **Application**: http://localhost:8080
   - **Database**: localhost:5432
   - **Redis**: localhost:6379
   - **Grafana**: http://localhost:3000

### Custom Configuration

1. **Environment Variables**
   ```bash
   # Create environment file
   cp .env.example .env
   
   # Edit configuration
   notepad .env
   ```

2. **Database Initialization**
   ```bash
   # Initialize with custom data
   docker-compose exec db psql -U higgs_user -d higgs_domino -f /docker-entrypoint-initdb.d/setup.sql
   ```

3. **Service Scaling**
   ```bash
   # Scale application instances
   docker-compose up -d --scale app=3
   ```

### Development Workflow

1. **Code Changes**
   ```bash
   # Rebuild after code changes
   docker-compose build app
   docker-compose up -d app
   ```

2. **Database Changes**
   ```bash
   # Apply new migrations
   docker-compose exec app npm run migrate
   ```

3. **Log Monitoring**
   ```bash
   # Follow application logs
   docker-compose logs -f app
   
   # Database logs
   docker-compose logs -f db
   ```

## ☸️ Kubernetes Production Deployment

### Cluster Preparation

1. **Cluster Requirements**
   ```yaml
   # Minimum cluster specs
   nodes: 3
   cpu_per_node: 2
   memory_per_node: 4Gi
   storage_class: fast-ssd
   ```

2. **Namespace Creation**
   ```bash
   kubectl create namespace higgs-domino
   kubectl config set-context --current --namespace=higgs-domino
   ```

3. **RBAC Setup**
   ```bash
   # Apply RBAC configurations
   kubectl apply -f helm-chart/templates/rbac.yaml
   ```

### Helm Deployment

#### Development Environment

1. **Install with Default Values**
   ```bash
   helm install higgs-domino ./helm-chart \
     --namespace higgs-domino \
     --create-namespace
   ```

2. **Verify Installation**
   ```bash
   helm status higgs-domino
   kubectl get pods
   kubectl get services
   ```

3. **Run Tests**
   ```bash
   helm test higgs-domino
   ```

#### Staging Environment

1. **Create Staging Values**
   ```yaml
   # values-staging.yaml
   environment: staging
   
   app:
     replicaCount: 2
     image:
       tag: "staging-latest"
   
   database:
     persistence:
       size: 50Gi
   
   monitoring:
     enabled: true
   
   ingress:
     enabled: true
     hosts:
       - host: staging.higgs-domino.com
         paths:
           - path: /
             pathType: Prefix
   ```

2. **Deploy to Staging**
   ```bash
   helm install higgs-domino-staging ./helm-chart \
     -f values-staging.yaml \
     --namespace higgs-domino-staging \
     --create-namespace
   ```

#### Production Environment

1. **Create Production Values**
   ```yaml
   # values-production.yaml
   environment: production
   
   app:
     replicaCount: 5
     image:
       tag: "v1.0.0"
     resources:
       requests:
         cpu: 500m
         memory: 1Gi
       limits:
         cpu: 2000m
         memory: 4Gi
   
   database:
     persistence:
       enabled: true
       size: 200Gi
       storageClass: fast-ssd
     backup:
       enabled: true
       schedule: "0 2 * * *"
   
   redis:
     persistence:
       enabled: true
       size: 20Gi
   
   monitoring:
     enabled: true
     prometheus:
       retention: 30d
     grafana:
       persistence:
         enabled: true
   
   autoscaling:
     enabled: true
     minReplicas: 3
     maxReplicas: 20
     targetCPUUtilizationPercentage: 70
   
   ingress:
     enabled: true
     className: nginx
     annotations:
       cert-manager.io/cluster-issuer: letsencrypt-prod
       nginx.ingress.kubernetes.io/rate-limit: "100"
     hosts:
       - host: api.higgs-domino.com
         paths:
           - path: /
             pathType: Prefix
     tls:
       - secretName: higgs-domino-tls
         hosts:
           - api.higgs-domino.com
   
   security:
     networkPolicies:
       enabled: true
     podSecurityPolicy:
       enabled: true
   ```

2. **Deploy to Production**
   ```bash
   # Create production namespace
   kubectl create namespace higgs-domino-prod
   
   # Deploy with production values
   helm install higgs-domino-prod ./helm-chart \
     -f values-production.yaml \
     --namespace higgs-domino-prod
   ```

3. **Post-Deployment Verification**
   ```bash
   # Check deployment status
   kubectl get pods -n higgs-domino-prod
   kubectl get services -n higgs-domino-prod
   kubectl get ingress -n higgs-domino-prod
   
   # Run comprehensive tests
   helm test higgs-domino-prod -n higgs-domino-prod
   
   # Check logs
   kubectl logs -f deployment/higgs-domino-app -n higgs-domino-prod
   ```

### Database Migration

1. **Pre-Migration Backup**
   ```bash
   # Create backup before migration
   kubectl exec -it postgresql-0 -n higgs-domino-prod -- \
     pg_dump -U higgs_user higgs_domino > backup-pre-migration.sql
   ```

2. **Run Migration Job**
   ```bash
   # Apply migration job
   kubectl apply -f helm-chart/templates/migration-job.yaml
   
   # Monitor migration progress
   kubectl logs -f job/higgs-domino-migration -n higgs-domino-prod
   ```

3. **Verify Migration**
   ```bash
   # Check migration status
   kubectl exec -it postgresql-0 -n higgs-domino-prod -- \
     psql -U higgs_user -d higgs_domino -c "SELECT * FROM schema_migrations;"
   ```

## 🔧 Configuration Management

### Environment-Specific Configurations

#### Development
```yaml
# Development settings
debug: true
log_level: debug
database:
  host: localhost
  port: 5432
  ssl_mode: disable
redis:
  host: localhost
  port: 6379
monitoring:
  enabled: false
```

#### Staging
```yaml
# Staging settings
debug: false
log_level: info
database:
  host: postgres-staging.internal
  port: 5432
  ssl_mode: require
redis:
  host: redis-staging.internal
  port: 6379
monitoring:
  enabled: true
```

#### Production
```yaml
# Production settings
debug: false
log_level: warn
database:
  host: postgres-prod.internal
  port: 5432
  ssl_mode: require
  connection_pool: 20
redis:
  host: redis-prod.internal
  port: 6379
  cluster_mode: true
monitoring:
  enabled: true
  metrics_interval: 30s
```

### Secrets Management

1. **Create Secrets**
   ```bash
   # Database credentials
   kubectl create secret generic db-credentials \
     --from-literal=username=higgs_user \
     --from-literal=password=secure_password \
     -n higgs-domino-prod
   
   # JWT secrets
   kubectl create secret generic jwt-secrets \
     --from-literal=secret=your-jwt-secret-key \
     -n higgs-domino-prod
   
   # Redis password
   kubectl create secret generic redis-auth \
     --from-literal=password=redis_password \
     -n higgs-domino-prod
   ```

2. **External Secrets (Optional)**
   ```yaml
   # external-secrets.yaml
   apiVersion: external-secrets.io/v1beta1
   kind: SecretStore
   metadata:
     name: vault-backend
   spec:
     provider:
       vault:
         server: "https://vault.company.com"
         path: "secret"
         version: "v2"
   ```

## 📊 Monitoring Setup

### Prometheus Configuration

1. **Custom Metrics**
   ```yaml
   # prometheus-config.yaml
   global:
     scrape_interval: 15s
     evaluation_interval: 15s
   
   scrape_configs:
     - job_name: 'higgs-domino-app'
       static_configs:
         - targets: ['higgs-domino-app:8080']
       metrics_path: /metrics
       scrape_interval: 30s
   
     - job_name: 'postgresql'
       static_configs:
         - targets: ['postgresql:9187']
   
     - job_name: 'redis'
       static_configs:
         - targets: ['redis:9121']
   ```

2. **Alert Rules**
   ```yaml
   # alert-rules.yaml
   groups:
     - name: higgs-domino-alerts
       rules:
         - alert: HighErrorRate
           expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
           for: 5m
           labels:
             severity: critical
           annotations:
             summary: High error rate detected
   
         - alert: DatabaseConnectionFailure
           expr: up{job="postgresql"} == 0
           for: 2m
           labels:
             severity: critical
           annotations:
             summary: Database connection failed
   ```

### Grafana Dashboards

1. **Application Dashboard**
   - Request rate and latency
   - Error rates by endpoint
   - Active user sessions
   - Game room statistics

2. **Infrastructure Dashboard**
   - CPU and memory usage
   - Network I/O
   - Disk usage and IOPS
   - Pod restart counts

3. **Business Metrics Dashboard**
   - Daily active users
   - Revenue metrics
   - Game completion rates
   - User engagement metrics

## 🔒 Security Hardening

### Network Security

1. **Network Policies**
   ```yaml
   # network-policy.yaml
   apiVersion: networking.k8s.io/v1
   kind: NetworkPolicy
   metadata:
     name: higgs-domino-netpol
   spec:
     podSelector:
       matchLabels:
         app: higgs-domino
     policyTypes:
     - Ingress
     - Egress
     ingress:
     - from:
       - podSelector:
           matchLabels:
             app: nginx-ingress
       ports:
       - protocol: TCP
         port: 8080
     egress:
     - to:
       - podSelector:
           matchLabels:
             app: postgresql
       ports:
       - protocol: TCP
         port: 5432
   ```

2. **Pod Security Standards**
   ```yaml
   # pod-security-policy.yaml
   apiVersion: policy/v1beta1
   kind: PodSecurityPolicy
   metadata:
     name: higgs-domino-psp
   spec:
     privileged: false
     allowPrivilegeEscalation: false
     requiredDropCapabilities:
       - ALL
     volumes:
       - 'configMap'
       - 'emptyDir'
       - 'projected'
       - 'secret'
       - 'downwardAPI'
       - 'persistentVolumeClaim'
     runAsUser:
       rule: 'MustRunAsNonRoot'
     seLinux:
       rule: 'RunAsAny'
     fsGroup:
       rule: 'RunAsAny'
   ```

### SSL/TLS Configuration

1. **Certificate Management**
   ```bash
   # Install cert-manager
   kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.8.0/cert-manager.yaml
   
   # Create cluster issuer
   kubectl apply -f - <<EOF
   apiVersion: cert-manager.io/v1
   kind: ClusterIssuer
   metadata:
     name: letsencrypt-prod
   spec:
     acme:
       server: https://acme-v02.api.letsencrypt.org/directory
       email: admin@higgs-domino.com
       privateKeySecretRef:
         name: letsencrypt-prod
       solvers:
       - http01:
           ingress:
             class: nginx
   EOF
   ```

## 🚨 Troubleshooting

### Common Issues

#### Pod Startup Failures

1. **Check Pod Status**
   ```bash
   kubectl get pods -n higgs-domino-prod
   kubectl describe pod <pod-name> -n higgs-domino-prod
   ```

2. **Review Logs**
   ```bash
   kubectl logs <pod-name> -n higgs-domino-prod
   kubectl logs <pod-name> -n higgs-domino-prod --previous
   ```

3. **Common Solutions**
   - Check resource quotas
   - Verify image pull secrets
   - Review environment variables
   - Check persistent volume claims

#### Database Connection Issues

1. **Test Connectivity**
   ```bash
   # Test from application pod
   kubectl exec -it <app-pod> -n higgs-domino-prod -- \
     nc -zv postgresql 5432
   
   # Check database logs
   kubectl logs postgresql-0 -n higgs-domino-prod
   ```

2. **Verify Credentials**
   ```bash
   # Check secret values
   kubectl get secret db-credentials -o yaml -n higgs-domino-prod
   ```

#### Performance Issues

1. **Resource Monitoring**
   ```bash
   # Check resource usage
   kubectl top pods -n higgs-domino-prod
   kubectl top nodes
   ```

2. **Database Performance**
   ```sql
   -- Check slow queries
   SELECT query, mean_time, calls 
   FROM pg_stat_statements 
   ORDER BY mean_time DESC 
   LIMIT 10;
   
   -- Check active connections
   SELECT count(*) FROM pg_stat_activity;
   ```

### Recovery Procedures

#### Application Recovery

1. **Rolling Restart**
   ```bash
   kubectl rollout restart deployment/higgs-domino-app -n higgs-domino-prod
   kubectl rollout status deployment/higgs-domino-app -n higgs-domino-prod
   ```

2. **Rollback Deployment**
   ```bash
   # Check rollout history
   kubectl rollout history deployment/higgs-domino-app -n higgs-domino-prod
   
   # Rollback to previous version
   kubectl rollout undo deployment/higgs-domino-app -n higgs-domino-prod
   ```

#### Database Recovery

1. **Point-in-Time Recovery**
   ```bash
   # Restore from backup
   kubectl exec -it postgresql-0 -n higgs-domino-prod -- \
     psql -U higgs_user -d higgs_domino < backup-file.sql
   ```

2. **Replica Promotion**
   ```bash
   # Promote read replica to primary
   kubectl patch postgresql postgresql-replica \
     --type='merge' \
     -p='{"spec":{"role":"primary"}}'
   ```

## 📈 Scaling Strategies

### Horizontal Scaling

1. **Manual Scaling**
   ```bash
   # Scale application pods
   kubectl scale deployment higgs-domino-app --replicas=10 -n higgs-domino-prod
   ```

2. **Auto Scaling**
   ```yaml
   # hpa.yaml
   apiVersion: autoscaling/v2
   kind: HorizontalPodAutoscaler
   metadata:
     name: higgs-domino-hpa
   spec:
     scaleTargetRef:
       apiVersion: apps/v1
       kind: Deployment
       name: higgs-domino-app
     minReplicas: 3
     maxReplicas: 20
     metrics:
     - type: Resource
       resource:
         name: cpu
         target:
           type: Utilization
           averageUtilization: 70
     - type: Resource
       resource:
         name: memory
         target:
           type: Utilization
           averageUtilization: 80
   ```

### Vertical Scaling

1. **Resource Adjustment**
   ```bash
   # Update resource limits
   kubectl patch deployment higgs-domino-app -p '{
     "spec": {
       "template": {
         "spec": {
           "containers": [{
             "name": "app",
             "resources": {
               "requests": {"cpu": "1000m", "memory": "2Gi"},
               "limits": {"cpu": "2000m", "memory": "4Gi"}
             }
           }]
         }
       }
     }
   }'
   ```

## 🔄 Upgrade Procedures

### Application Upgrades

1. **Blue-Green Deployment**
   ```bash
   # Deploy new version alongside current
   helm install higgs-domino-green ./helm-chart \
     -f values-production.yaml \
     --set app.image.tag=v1.1.0 \
     --namespace higgs-domino-prod
   
   # Switch traffic after validation
   kubectl patch service higgs-domino-app \
     -p '{"spec":{"selector":{"version":"green"}}}'
   ```

2. **Rolling Update**
   ```bash
   # Update image tag
   helm upgrade higgs-domino-prod ./helm-chart \
     -f values-production.yaml \
     --set app.image.tag=v1.1.0 \
     --namespace higgs-domino-prod
   ```

### Database Upgrades

1. **PostgreSQL Version Upgrade**
   ```bash
   # Backup before upgrade
   kubectl exec postgresql-0 -n higgs-domino-prod -- \
     pg_dumpall -U postgres > full-backup.sql
   
   # Upgrade using Helm
   helm upgrade higgs-domino-prod ./helm-chart \
     --set postgresql.image.tag=14.5.0 \
     --namespace higgs-domino-prod
   ```

## 📋 Maintenance Checklist

### Daily Tasks
- [ ] Check application health endpoints
- [ ] Review error logs and alerts
- [ ] Monitor resource utilization
- [ ] Verify backup completion
- [ ] Check security scan results

### Weekly Tasks
- [ ] Review performance metrics
- [ ] Update security patches
- [ ] Clean up old logs and backups
- [ ] Test disaster recovery procedures
- [ ] Review capacity planning metrics

### Monthly Tasks
- [ ] Full security audit
- [ ] Performance optimization review
- [ ] Dependency updates
- [ ] Documentation updates
- [ ] Disaster recovery testing

---

**Last Updated**: December 2024  
**Version**: 1.0.0  
**Support**: deployment-support@higgs-domino.com