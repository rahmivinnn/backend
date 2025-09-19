#!/bin/bash

# Higgs Domino Full-Stack Deployment Script
# This script automates the deployment process for development, staging, and production environments

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="higgs-domino"
DOCKER_REGISTRY="your-registry.com"
KUBE_NAMESPACE="higgs-domino"
HELM_CHART_PATH="./helm-chart"
BACKUP_DIR="./backups"
LOG_FILE="./deployment.log"

# Default values
ENVIRONMENT="development"
SKIP_TESTS=false
SKIP_BUILD=false
SKIP_MIGRATION=false
FORCE_DEPLOY=false
ROLLBACK=false
VERSION="latest"

# Functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" | tee -a "$LOG_FILE"
    exit 1
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}" | tee -a "$LOG_FILE"
}

show_help() {
    cat << EOF
Higgs Domino Deployment Script

Usage: $0 [OPTIONS]

Options:
    -e, --environment ENV     Target environment (development|staging|production) [default: development]
    -v, --version VERSION     Application version to deploy [default: latest]
    -t, --skip-tests         Skip running tests
    -b, --skip-build         Skip building Docker images
    -m, --skip-migration     Skip database migrations
    -f, --force              Force deployment without confirmation
    -r, --rollback           Rollback to previous version
    -h, --help               Show this help message

Examples:
    $0 -e production -v 1.2.3
    $0 --environment staging --skip-tests
    $0 --rollback --environment production

EOF
}

check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if required tools are installed
    command -v docker >/dev/null 2>&1 || error "Docker is not installed"
    command -v kubectl >/dev/null 2>&1 || error "kubectl is not installed"
    command -v helm >/dev/null 2>&1 || error "Helm is not installed"
    command -v node >/dev/null 2>&1 || error "Node.js is not installed"
    command -v npm >/dev/null 2>&1 || error "npm is not installed"
    
    # Check Docker daemon
    docker info >/dev/null 2>&1 || error "Docker daemon is not running"
    
    # Check Kubernetes connection
    kubectl cluster-info >/dev/null 2>&1 || error "Cannot connect to Kubernetes cluster"
    
    log "Prerequisites check passed"
}

setup_environment() {
    log "Setting up environment: $ENVIRONMENT"
    
    # Create namespace if it doesn't exist
    kubectl create namespace "$KUBE_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    
    # Set environment-specific configurations
    case $ENVIRONMENT in
        "development")
            export NODE_ENV=development
            export REPLICAS=1
            export RESOURCES_REQUESTS_CPU=100m
            export RESOURCES_REQUESTS_MEMORY=256Mi
            export RESOURCES_LIMITS_CPU=500m
            export RESOURCES_LIMITS_MEMORY=512Mi
            ;;
        "staging")
            export NODE_ENV=staging
            export REPLICAS=2
            export RESOURCES_REQUESTS_CPU=250m
            export RESOURCES_REQUESTS_MEMORY=512Mi
            export RESOURCES_LIMITS_CPU=1000m
            export RESOURCES_LIMITS_MEMORY=1Gi
            ;;
        "production")
            export NODE_ENV=production
            export REPLICAS=3
            export RESOURCES_REQUESTS_CPU=500m
            export RESOURCES_REQUESTS_MEMORY=1Gi
            export RESOURCES_LIMITS_CPU=2000m
            export RESOURCES_LIMITS_MEMORY=2Gi
            ;;
        *)
            error "Invalid environment: $ENVIRONMENT"
            ;;
    esac
    
    log "Environment setup completed"
}

run_tests() {
    if [ "$SKIP_TESTS" = true ]; then
        warn "Skipping tests"
        return
    fi
    
    log "Running tests..."
    
    # Install dependencies
    npm ci
    
    # Run linting
    npm run lint
    
    # Run unit tests
    npm test
    
    # Run integration tests
    npm run test:integration
    
    # Run security audit
    npm audit --audit-level moderate
    
    log "All tests passed"
}

build_images() {
    if [ "$SKIP_BUILD" = true ]; then
        warn "Skipping build"
        return
    fi
    
    log "Building Docker images..."
    
    # Build main application image
    docker build -t "$DOCKER_REGISTRY/$APP_NAME:$VERSION" .
    docker build -t "$DOCKER_REGISTRY/$APP_NAME:latest" .
    
    # Push images to registry
    docker push "$DOCKER_REGISTRY/$APP_NAME:$VERSION"
    docker push "$DOCKER_REGISTRY/$APP_NAME:latest"
    
    log "Docker images built and pushed successfully"
}

backup_database() {
    log "Creating database backup..."
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    # Get database pod
    DB_POD=$(kubectl get pods -n "$KUBE_NAMESPACE" -l app=postgres -o jsonpath='{.items[0].metadata.name}')
    
    if [ -n "$DB_POD" ]; then
        # Create backup
        BACKUP_FILE="$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).sql"
        kubectl exec -n "$KUBE_NAMESPACE" "$DB_POD" -- pg_dump -U postgres higgs_domino > "$BACKUP_FILE"
        
        # Compress backup
        gzip "$BACKUP_FILE"
        
        log "Database backup created: $BACKUP_FILE.gz"
    else
        warn "Database pod not found, skipping backup"
    fi
}

run_migrations() {
    if [ "$SKIP_MIGRATION" = true ]; then
        warn "Skipping database migrations"
        return
    fi
    
    log "Running database migrations..."
    
    # Create migration job
    cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration-$(date +%s)
  namespace: $KUBE_NAMESPACE
spec:
  template:
    spec:
      containers:
      - name: migration
        image: $DOCKER_REGISTRY/$APP_NAME:$VERSION
        command: ["npm", "run", "migrate"]
        envFrom:
        - configMapRef:
            name: higgs-domino-config
        env:
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: higgs-domino-secrets
              key: DB_USER
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: higgs-domino-secrets
              key: DB_PASSWORD
      restartPolicy: Never
  backoffLimit: 3
EOF
    
    # Wait for migration to complete
    kubectl wait --for=condition=complete --timeout=300s job -l app=migration -n "$KUBE_NAMESPACE"
    
    log "Database migrations completed"
}

deploy_application() {
    log "Deploying application..."
    
    if [ "$ROLLBACK" = true ]; then
        log "Rolling back to previous version..."
        kubectl rollout undo deployment/higgs-domino-app -n "$KUBE_NAMESPACE"
    else
        # Update deployment with new image
        kubectl set image deployment/higgs-domino-app higgs-domino-app="$DOCKER_REGISTRY/$APP_NAME:$VERSION" -n "$KUBE_NAMESPACE"
        
        # Wait for rollout to complete
        kubectl rollout status deployment/higgs-domino-app -n "$KUBE_NAMESPACE" --timeout=600s
    fi
    
    log "Application deployment completed"
}

run_health_checks() {
    log "Running health checks..."
    
    # Wait for pods to be ready
    kubectl wait --for=condition=ready pod -l app=higgs-domino-app -n "$KUBE_NAMESPACE" --timeout=300s
    
    # Get service endpoint
    SERVICE_IP=$(kubectl get service higgs-domino-service -n "$KUBE_NAMESPACE" -o jsonpath='{.spec.clusterIP}')
    
    # Test health endpoint
    kubectl run health-check --rm -i --restart=Never --image=curlimages/curl -- \
        curl -f "http://$SERVICE_IP/health" || error "Health check failed"
    
    # Test API endpoint
    kubectl run api-check --rm -i --restart=Never --image=curlimages/curl -- \
        curl -f "http://$SERVICE_IP/api/v1/health" || error "API check failed"
    
    log "Health checks passed"
}

setup_monitoring() {
    log "Setting up monitoring..."
    
    # Deploy Prometheus if not exists
    if ! kubectl get deployment prometheus -n "$KUBE_NAMESPACE" >/dev/null 2>&1; then
        kubectl apply -f k8s-deployment.yml
    fi
    
    # Update Grafana dashboards
    if kubectl get configmap grafana-dashboards -n "$KUBE_NAMESPACE" >/dev/null 2>&1; then
        kubectl delete configmap grafana-dashboards -n "$KUBE_NAMESPACE"
    fi
    
    kubectl create configmap grafana-dashboards --from-file=grafana-dashboard.json -n "$KUBE_NAMESPACE"
    
    log "Monitoring setup completed"
}

cleanup() {
    log "Cleaning up..."
    
    # Remove old Docker images
    docker image prune -f
    
    # Clean up old jobs
    kubectl delete jobs --field-selector status.successful=1 -n "$KUBE_NAMESPACE"
    
    # Clean up old replica sets
    kubectl delete rs --field-selector status.replicas=0 -n "$KUBE_NAMESPACE"
    
    log "Cleanup completed"
}

send_notification() {
    local status=$1
    local message=$2
    
    # Send Slack notification (if webhook URL is configured)
    if [ -n "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"Deployment $status: $message\"}" \
            "$SLACK_WEBHOOK_URL"
    fi
    
    # Send email notification (if configured)
    if [ -n "$EMAIL_NOTIFICATION" ]; then
        echo "$message" | mail -s "Deployment $status" "$EMAIL_NOTIFICATION"
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -t|--skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        -b|--skip-build)
            SKIP_BUILD=true
            shift
            ;;
        -m|--skip-migration)
            SKIP_MIGRATION=true
            shift
            ;;
        -f|--force)
            FORCE_DEPLOY=true
            shift
            ;;
        -r|--rollback)
            ROLLBACK=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    error "Invalid environment: $ENVIRONMENT. Must be development, staging, or production."
fi

# Confirmation for production deployments
if [ "$ENVIRONMENT" = "production" ] && [ "$FORCE_DEPLOY" = false ]; then
    echo -e "${YELLOW}You are about to deploy to PRODUCTION environment.${NC}"
    echo -e "${YELLOW}Version: $VERSION${NC}"
    echo -e "${YELLOW}Rollback: $ROLLBACK${NC}"
    read -p "Are you sure you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log "Deployment cancelled by user"
        exit 0
    fi
fi

# Main deployment process
log "Starting deployment process..."
log "Environment: $ENVIRONMENT"
log "Version: $VERSION"
log "Rollback: $ROLLBACK"

trap 'error "Deployment failed"' ERR

# Execute deployment steps
check_prerequisites
setup_environment

if [ "$ROLLBACK" = false ]; then
    run_tests
    build_images
fi

backup_database
run_migrations
deploy_application
run_health_checks
setup_monitoring
cleanup

log "Deployment completed successfully!"
send_notification "SUCCESS" "Deployment to $ENVIRONMENT completed successfully. Version: $VERSION"

# Display useful information
info "Deployment Summary:"
info "Environment: $ENVIRONMENT"
info "Version: $VERSION"
info "Namespace: $KUBE_NAMESPACE"
info "Application URL: http://$(kubectl get ingress higgs-domino-ingress -n "$KUBE_NAMESPACE" -o jsonpath='{.spec.rules[0].host}')"
info "Grafana URL: http://$(kubectl get service grafana-service -n "$KUBE_NAMESPACE" -o jsonpath='{.spec.clusterIP}'):3000"
info "Prometheus URL: http://$(kubectl get service prometheus-service -n "$KUBE_NAMESPACE" -o jsonpath='{.spec.clusterIP}'):9090"

log "Deployment script completed!"