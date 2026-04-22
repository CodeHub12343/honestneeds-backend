# Contributing to HonestNeed Backend

## Getting Started

1. Fork the repository
2. Clone your fork
3. Create a feature branch
4. Make your changes
5. Run tests and linting
6. Submit a pull request

## Branch Naming Convention

- `feature/feature-name` - New features
- `bugfix/bug-name` - Bug fixes
- `refactor/component-name` - Refactoring
- `docs/update-description` - Documentation

## Code Standards

- Use `const` by default
- Use arrow functions
- Use async/await
- Add comments for complex logic
- Keep functions small and focused
- Max line length: 100 characters
- 2 space indentation

## Testing

Ensure all tests pass before submitting:

```bash
npm test               # Run all tests
npm run test:coverage  # Check coverage
```

## Commit Message Format

```
type: subject

body

footer
```

Types:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Code style
- `refactor:` Code refactoring
- `test:` Tests
- `chore:` Build/dependencies

Example:
```
feat: add user registration endpoint

- Create POST /auth/register
- Add email validation
- Hash passwords with bcrypt

Fixes #123
```

## Pull Request Process

1. Update README.md if needed
2. Add/update tests for changes
3. Ensure all tests pass
4. Request review from 2+ team members
5. Address review feedback
6. Merge when approved

## Questions?

- Create an issue on GitHub
- Email: support@honestneed.com
- Slack: #backend-development

Thank you for contributing!
