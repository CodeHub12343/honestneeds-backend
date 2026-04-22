# Deployment Guidelines

## Environment Variables

### Development
```bash
NODE_ENV=development
API_PORT=5000
MONGODB_URI=mongodb://localhost:27017/honestneed-dev
```

### Staging
```bash
NODE_ENV=staging
API_PORT=5000
MONGODB_URI=mongodb+srv://user:pass@staging-cluster.mongodb.net/honestneed-staging
```

### Production
```bash
NODE_ENV=production
API_PORT=5000
MONGODB_URI=mongodb+srv://user:pass@prod-cluster.mongodb.net/honestneed-prod
```

## Docker Deployment

### Build Image
```bash
docker build -t honestneed-api:latest .
```

### Run Container
```bash
docker run -p 5000:5000 \
  -e NODE_ENV=production \
  -e MONGODB_URI=mongodb+srv://user:pass@prod.mongodb.net/honestneed \
  honestneed-api:latest
```

### Docker Compose
```bash
docker-compose up -d
```

## Health Checks

```bash
curl http://localhost:5000/health
```

## Monitoring

- **Logs:** `./logs/` directory
- **Health:** `GET /health`
- **Error tracking:** Check Sentry dashboard (when configured)

## Troubleshooting

### Port Already in Use
```bash
lsof -i :5000  # Find process
kill -9 <PID>  # Kill process
```

### Database Connection Issues
- Verify MongoDB URI
- Check network connectivity
- Verify credentials

### Out of Memory
- Increase Node heap: `NODE_OPTIONS=--max-old-space-size=512 npm start`
- Check for memory leaks
