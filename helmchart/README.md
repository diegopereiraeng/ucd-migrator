# UCD Migrator Helm Chart

This Helm chart deploys the Harness UCD Process Analyzer & Migration Assistant to a Kubernetes cluster.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- Ingress controller (nginx, traefik, etc.) if using ingress

## Installation

### Quick Start

```bash
# Install with default values
helm install ucd-migrator ./

# Install with custom values
helm install ucd-migrator ./ -f my-values.yaml

# Install with custom image
helm install ucd-migrator ./ \
  --set image.repository=your-registry/ucd-migrator \
  --set image.tag=v1.0.0
```

### Upgrade

```bash
helm upgrade ucd-migrator ./

# Upgrade with new image
helm upgrade ucd-migrator ./ --set image.tag=v1.0.1
```

### Uninstall

```bash
helm uninstall ucd-migrator
```

## Configuration

The following table lists the configurable parameters and their default values:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of replicas | `2` |
| `image.repository` | Image repository | `ucd-migrator` |
| `image.tag` | Image tag | `latest` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `service.type` | Service type | `ClusterIP` |
| `service.port` | Service port | `80` |
| `ingress.enabled` | Enable ingress | `true` |
| `ingress.className` | Ingress class name | `nginx` |
| `ingress.hosts[0].host` | Ingress host | `ucd-migrator.local` |
| `ingress.tls` | TLS configuration | `[]` |
| `resources.limits.cpu` | CPU limit | `500m` |
| `resources.limits.memory` | Memory limit | `256Mi` |
| `resources.requests.cpu` | CPU request | `100m` |
| `resources.requests.memory` | Memory request | `128Mi` |
| `autoscaling.enabled` | Enable HPA | `false` |
| `autoscaling.minReplicas` | Minimum replicas | `2` |
| `autoscaling.maxReplicas` | Maximum replicas | `10` |

## Examples

### Basic Installation

```bash
helm install ucd-migrator ./
```

### With Custom Domain and TLS

```bash
helm install ucd-migrator ./ \
  --set ingress.hosts[0].host=ucd-migrator.example.com \
  --set ingress.tls[0].secretName=ucd-migrator-tls \
  --set ingress.tls[0].hosts[0]=ucd-migrator.example.com \
  --set ingress.annotations."cert-manager\.io/cluster-issuer"=letsencrypt-prod
```

### With Autoscaling

```bash
helm install ucd-migrator ./ \
  --set autoscaling.enabled=true \
  --set autoscaling.minReplicas=2 \
  --set autoscaling.maxReplicas=10
```

### With Custom Resources

```bash
helm install ucd-migrator ./ \
  --set resources.limits.cpu=1000m \
  --set resources.limits.memory=512Mi \
  --set resources.requests.cpu=200m \
  --set resources.requests.memory=256Mi
```

### Using Values File

Create a `custom-values.yaml`:

```yaml
image:
  repository: your-registry/ucd-migrator
  tag: v1.0.0

replicas: 3

ingress:
  enabled: true
  host: ucd-migrator.example.com
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  tls:
    - secretName: ucd-migrator-tls
      hosts:
        - ucd-migrator.example.com

resources:
  limits:
    cpu: 1000m
    memory: 512Mi
  requests:
    cpu: 200m
    memory: 256Mi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
```

Then install:

```bash
helm install ucd-migrator ./ -f custom-values.yaml
```

## Ingress Controllers

### NGINX Ingress Controller

```bash
helm install ucd-migrator ./ \
  --set ingress.className=nginx \
  --set ingress.annotations."nginx\.ingress\.kubernetes\.io/ssl-redirect"="true"
```

### Traefik

```bash
helm install ucd-migrator ./ \
  --set ingress.className=traefik
```

### AWS ALB

```yaml
ingress:
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -l app.kubernetes.io/name=ucd-migrator
```

### View Logs

```bash
kubectl logs -l app.kubernetes.io/name=ucd-migrator -f
```

### Check Ingress

```bash
kubectl describe ingress ucd-migrator
```

### Port Forward (for testing)

```bash
kubectl port-forward svc/ucd-migrator 8080:80
```

Then access at http://localhost:8080

## Notes

- The application is a static React app served by nginx
- Environment variables need to be set at build time (not runtime)
- Health checks are available at `/health` endpoint
- The chart includes HPA support for automatic scaling


