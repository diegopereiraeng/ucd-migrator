# Deployment Guide - Harness UCD Migrator

This guide covers building Docker images and deploying the application to Kubernetes using Helm.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Building Docker Image](#building-docker-image)
3. [Running Locally with Docker](#running-locally-with-docker)
4. [Deploying to Kubernetes with Helm](#deploying-to-kubernetes-with-helm)
5. [Configuration](#configuration)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Docker installed and running
- Kubernetes cluster access (kubectl configured)
- Helm 3.x installed
- Access to a container registry (Docker Hub, ECR, GCR, ACR, etc.)

---

## Building Docker Image

### 1. Build the Image

```bash
# Build the image
docker build -t ucd-migrator:latest .

# Or with a specific tag
docker build -t ucd-migrator:v1.0.0 .
```

### 2. Test Locally

```bash
# Run the container locally
docker run -d -p 8080:80 --name ucd-migrator ucd-migrator:latest

# Access the application
open http://localhost:8080

# Stop and remove
docker stop ucd-migrator
docker rm ucd-migrator
```

### 3. Push to Registry

```bash
# Tag for your registry
docker tag ucd-migrator:latest your-registry/ucd-migrator:v1.0.0

# Login to registry
docker login your-registry

# Push the image
docker push your-registry/ucd-migrator:v1.0.0
```

**Common Registry Examples:**

```bash
# Docker Hub
docker tag ucd-migrator:latest yourusername/ucd-migrator:v1.0.0
docker push yourusername/ucd-migrator:v1.0.0

# AWS ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com
docker tag ucd-migrator:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/ucd-migrator:v1.0.0
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/ucd-migrator:v1.0.0

# Google GCR
gcloud auth configure-docker
docker tag ucd-migrator:latest gcr.io/your-project/ucd-migrator:v1.0.0
docker push gcr.io/your-project/ucd-migrator:v1.0.0

# Azure ACR
az acr login --name yourregistry
docker tag ucd-migrator:latest yourregistry.azurecr.io/ucd-migrator:v1.0.0
docker push yourregistry.azurecr.io/ucd-migrator:v1.0.0
```

---

## Running Locally with Docker

### Basic Run

```bash
docker run -d \
  -p 8080:80 \
  --name ucd-migrator \
  ucd-migrator:latest
```

### With Environment Variables (for build-time)

**Note:** Since this is a static React app, environment variables need to be set at build time, not runtime. If you need to change API keys, rebuild the image.

For development/testing with different API keys:

1. Create a `.env.production` file:
```bash
VITE_GEMINI_API_KEY=your_key_here
VITE_CLAUDE_API_KEY=your_key_here
VITE_OPENAI_API_KEY=your_key_here
```

2. Rebuild the image:
```bash
docker build -t ucd-migrator:latest .
```

---

## Deploying to Kubernetes with Helm

### 1. Install Helm Chart

```bash
# Install with default values
helm install ucd-migrator ./helmchart

# Install with custom values file
helm install ucd-migrator ./helmchart -f my-values.yaml

# Install with custom values inline
helm install ucd-migrator ./helmchart \
  --set image.repository=your-registry/ucd-migrator \
  --set image.tag=v1.0.0 \
  --set ingress.host=ucd-migrator.example.com
```

### 2. Upgrade Existing Deployment

```bash
# Upgrade with new image
helm upgrade ucd-migrator ./helmchart \
  --set image.tag=v1.0.1

# Upgrade with values file
helm upgrade ucd-migrator ./helmchart -f my-values.yaml
```

### 3. Uninstall

```bash
helm uninstall ucd-migrator
```

### 4. Check Status

```bash
# Check Helm release
helm status ucd-migrator

# Check pods
kubectl get pods -l app.kubernetes.io/name=ucd-migrator

# Check ingress
kubectl get ingress -l app.kubernetes.io/name=ucd-migrator

# View logs
kubectl logs -l app.kubernetes.io/name=ucd-migrator -f
```

---

## Configuration

### Helm Values

Edit `helmchart/values.yaml` to customize your deployment:

**Key Configuration Options:**

- **Image:** Repository and tag
- **Replicas:** Number of pod replicas
- **Resources:** CPU and memory limits
- **Ingress:** Host, TLS, annotations
- **Service:** Service type and port

### Example Custom Values File

Create `my-values.yaml`:

```yaml
image:
  repository: your-registry/ucd-migrator
  tag: v1.0.0

replicas: 3

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 256Mi

ingress:
  enabled: true
  host: ucd-migrator.yourdomain.com
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  tls:
    enabled: true
    secretName: ucd-migrator-tls
```

Then deploy:
```bash
helm install ucd-migrator ./helmchart -f my-values.yaml
```

---

## Ingress Configuration

### Basic Ingress (HTTP)

The default Helm chart creates an ingress. Access your application via the configured host.

### TLS/HTTPS with cert-manager

1. Install cert-manager (if not already installed):
```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

2. Create a ClusterIssuer (example):
```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
```

3. Deploy with TLS:
```bash
helm install ucd-migrator ./helmchart \
  --set ingress.host=ucd-migrator.example.com \
  --set ingress.tls.enabled=true \
  --set ingress.annotations."cert-manager\.io/cluster-issuer"=letsencrypt-prod
```

### Custom Ingress Annotations

For different ingress controllers, add annotations:

```yaml
ingress:
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    # For AWS ALB
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
```

---

## Troubleshooting

### Pod Not Starting

```bash
# Check pod status
kubectl describe pod <pod-name>

# Check logs
kubectl logs <pod-name>

# Check events
kubectl get events --sort-by='.lastTimestamp'
```

### Ingress Not Working

```bash
# Check ingress
kubectl describe ingress ucd-migrator

# Check ingress controller
kubectl get pods -n ingress-nginx

# Test service directly
kubectl port-forward svc/ucd-migrator 8080:80
```

### Image Pull Errors

```bash
# Check image pull secrets
kubectl get secrets

# If using private registry, create secret:
kubectl create secret docker-registry regcred \
  --docker-server=your-registry \
  --docker-username=your-username \
  --docker-password=your-password \
  --docker-email=your-email

# Add to values.yaml:
imagePullSecrets:
  - name: regcred
```

### Application Not Loading

1. Check if the build was successful:
```bash
docker run --rm ucd-migrator:latest ls -la /usr/share/nginx/html
```

2. Check nginx configuration:
```bash
kubectl exec -it <pod-name> -- cat /etc/nginx/conf.d/default.conf
```

3. Test health endpoint:
```bash
kubectl exec -it <pod-name> -- wget -O- http://localhost/health
```

---

## Production Best Practices

1. **Use Specific Image Tags:** Avoid `latest` tag in production
2. **Set Resource Limits:** Always define CPU and memory limits
3. **Enable TLS:** Use HTTPS for all production deployments
4. **Configure Monitoring:** Add Prometheus metrics and health checks
5. **Set Up Logging:** Configure centralized logging (e.g., ELK, Loki)
6. **Use Secrets:** Store API keys in Kubernetes secrets (build-time)
7. **Enable Autoscaling:** Configure HPA for traffic spikes
8. **Backup Configuration:** Version control your Helm values files

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build Docker image
        run: docker build -t ucd-migrator:${{ github.sha }} .
      
      - name: Push to registry
        run: |
          docker tag ucd-migrator:${{ github.sha }} your-registry/ucd-migrator:${{ github.sha }}
          docker push your-registry/ucd-migrator:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Kubernetes
        run: |
          helm upgrade --install ucd-migrator ./helmchart \
            --set image.tag=${{ github.sha }} \
            --set ingress.host=ucd-migrator.example.com
```

---

## Support

For issues or questions:
- Check the [USAGE_GUIDE.md](./USAGE_GUIDE.md)
- Review application logs
- Check Kubernetes events
- Verify ingress controller is running

