# Contributing to Racing Cart

Thank you for your interest in contributing to Racing Cart! This document provides guidelines for contributing to the project.

## 🚀 Getting Started

### Prerequisites

- Node.js 16+ 
- npm or yarn
- Git

### Development Setup

1. **Fork the repository**
   ```bash
   # Fork on GitHub, then clone your fork
   git clone https://github.com/yourusername/vibecart.git
   cd vibecart
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd server && npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development servers**
   ```bash
   # Terminal 1: Start the game server
   cd server
   npm run dev
   
   # Terminal 2: Start the client
   cd ..
   npm run dev
   ```

## 🛠️ Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Make Your Changes

- Write clean, readable code
- Follow existing code style and patterns
- Add comments for complex logic
- Update documentation if needed

### 3. Test Thoroughly

- Test your changes in the browser
- Verify multiplayer functionality works
- Check that the game still runs locally
- Test on different devices if possible

### 4. Commit Your Changes

```bash
git add .
git commit -m "feat: add new feature description"
# or
git commit -m "fix: resolve issue with X"
```

Use conventional commit messages:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `style:` for formatting changes
- `refactor:` for code refactoring
- `test:` for adding tests

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## 📋 Pull Request Guidelines

### Before Submitting

- [ ] Code follows existing style patterns
- [ ] Changes are tested locally
- [ ] Documentation is updated if needed
- [ ] No console.log statements left in code
- [ ] No sensitive information included

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tested locally
- [ ] Multiplayer functionality verified
- [ ] No regressions introduced

## Screenshots (if applicable)
Add screenshots to help explain your changes

## Additional Notes
Any additional information about the changes
```

## 🎯 Areas for Contribution

### High Priority
- **Mobile Optimization**: Improve touch controls and responsive design
- **Performance**: Optimize rendering and reduce memory usage
- **Testing**: Add unit tests and integration tests
- **Documentation**: Improve code documentation and examples

### Medium Priority
- **New Features**: Additional car models, tracks, or game modes
- **UI/UX**: Improve user interface and experience
- **Accessibility**: Add keyboard navigation and screen reader support
- **Internationalization**: Add support for multiple languages

### Low Priority
- **Code Quality**: Refactoring and code organization
- **Build Tools**: Improve build process and tooling
- **CI/CD**: Add automated testing and deployment

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Description**: Clear description of the issue
2. **Steps to Reproduce**: Detailed steps to reproduce the bug
3. **Expected Behavior**: What should happen
4. **Actual Behavior**: What actually happens
5. **Environment**: Browser, OS, device information
6. **Screenshots**: If applicable

## 💡 Feature Requests

When suggesting features:

1. **Use Case**: Explain why this feature would be useful
2. **Implementation**: If you have ideas on how to implement it
3. **Alternatives**: Any alternative solutions you've considered
4. **Additional Context**: Any other relevant information

## 📝 Code Style Guidelines

### JavaScript
- Use ES6+ features
- Use meaningful variable and function names
- Add JSDoc comments for complex functions
- Use consistent indentation (2 spaces)

### CSS
- Use meaningful class names
- Group related styles together
- Use CSS custom properties for theming
- Keep styles responsive

### HTML
- Use semantic HTML elements
- Include proper accessibility attributes
- Keep markup clean and minimal

## 🤝 Community Guidelines

- Be respectful and inclusive
- Help others learn and grow
- Provide constructive feedback
- Follow the code of conduct

## 📞 Getting Help

- **Issues**: Use GitHub Issues for bug reports and feature requests
- **Discussions**: Use GitHub Discussions for questions and ideas
- **Documentation**: Check the README and ARCHITECTURE.md files

## 🎉 Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes for significant contributions
- GitHub contributor statistics

Thank you for contributing to Racing Cart! 🏁
