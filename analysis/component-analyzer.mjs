/**
 * ComponentAnalyzer - Extracts rich metadata from React TSX components
 * using the TypeScript compiler API (AST parsing).
 *
 * This metadata feeds into prompts so the LLM knows WHAT to test.
 */

import { getTS, createSourceFile } from './ts-loader.mjs';

export class ComponentAnalyzer {
  constructor(sourceCode, filePath) {
    this.sourceCode = sourceCode;
    this.filePath = filePath;
    this.ts = getTS();
    this.sourceFile = createSourceFile(filePath, sourceCode);
    this.imports = [];
    this.components = [];
    this.typeDefinitions = new Map();
    this._current = null;
  }

  analyze() {
    this._collectImports();
    this._collectTypes();
    this._findComponents(this.sourceFile);
    return this.components;
  }

  // ════════════════════════════════════════════════════════════════
  // IMPORT COLLECTION
  // ════════════════════════════════════════════════════════════════

  _collectImports() {
    const ts = this.ts;
    const visit = (node) => {
      if (ts.isImportDeclaration(node)) {
        const from = node.moduleSpecifier.getText().replace(/['"]/g, '');
        const clause = node.importClause;
        if (clause) {
          if (clause.name) {
            this.imports.push({ name: clause.name.text, from, isDefault: true });
          }
          if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
            for (const el of clause.namedBindings.elements) {
              this.imports.push({ name: el.name.text, from, isDefault: false });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(this.sourceFile);
  }

  // ════════════════════════════════════════════════════════════════
  // TYPE/INTERFACE COLLECTION
  // ════════════════════════════════════════════════════════════════

  _collectTypes() {
    const ts = this.ts;
    const visit = (node) => {
      if (ts.isInterfaceDeclaration(node)) {
        this._storeType(node.name.text, node.members);
      }
      if (ts.isTypeAliasDeclaration(node) && node.type && ts.isTypeLiteralNode(node.type)) {
        this._storeType(node.name.text, node.type.members);
      }
      ts.forEachChild(node, visit);
    };
    visit(this.sourceFile);
  }

  _storeType(name, members) {
    const ts = this.ts;
    const props = [];
    for (const m of members) {
      if (ts.isPropertySignature(m) && m.name && ts.isIdentifier(m.name)) {
        const typeStr = m.type ? this._text(m.type).trim() : 'any';
        props.push({
          name: m.name.text,
          type: typeStr,
          required: !m.questionToken,
          isCallback: typeStr.includes('=>') || /^on[A-Z]/.test(m.name.text),
          isBoolean: typeStr === 'boolean' || /^(is|has|show|can|should)[A-Z]/.test(m.name.text),
        });
      }
    }
    this.typeDefinitions.set(name, props);
  }

  // ════════════════════════════════════════════════════════════════
  // COMPONENT DETECTION (handles function, arrow, memo, forwardRef)
  // ════════════════════════════════════════════════════════════════

  _findComponents(node) {
    const ts = this.ts;

    // export function MyComponent() {}
    if (ts.isFunctionDeclaration(node) && node.name && this._isCompName(node.name.text)) {
      this._processComp(node, node.name.text, this._hasExport(node), this._hasDefault(node));
    }

    // const MyComponent = ...
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && this._isCompName(decl.name.text) && decl.initializer) {
          this._processVarDecl(decl, this._hasExport(node));
        }
      }
    }

    ts.forEachChild(node, (child) => this._findComponents(child));
  }

  _processVarDecl(decl, isExported) {
    const ts = this.ts;
    const name = decl.name.text;
    const init = decl.initializer;

    // Arrow / function expression
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
      this._processComp(init, name, isExported, false);
      return;
    }

    if (!ts.isCallExpression(init)) return;

    const callee = this._callName(init);

    // memo(fn) or React.memo(fn)
    if (callee === 'memo' || callee === 'React.memo') {
      const arg = init.arguments[0];
      if (!arg) return;
      if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
        this._processComp(arg, name, isExported, false, 'memo');
      } else if (ts.isCallExpression(arg)) {
        // memo(forwardRef(fn))
        const inner = this._callName(arg);
        if (inner === 'forwardRef' || inner === 'React.forwardRef') {
          const fn = arg.arguments[0];
          if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
            this._processComp(fn, name, isExported, false, 'memo+forwardRef');
          }
        }
      }
      return;
    }

    // forwardRef(fn)
    if (callee === 'forwardRef' || callee === 'React.forwardRef') {
      const arg = init.arguments[0];
      if (arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))) {
        this._processComp(arg, name, isExported, false, 'forwardRef');
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // COMPONENT BODY ANALYSIS
  // ════════════════════════════════════════════════════════════════

  _processComp(node, name, isExported, isDefault, wrapper = null) {
    const comp = {
      name,
      wrapper,
      isExported: isExported || this._isExportedElsewhere(name),
      isDefault: isDefault || this._isDefaultElsewhere(name),
      props: [],
      state: [],
      effects: [],
      refs: [],
      contexts: [],
      customHooks: [],
      handlers: [],
      buttons: [],
      inputs: [],
      forms: [],
      links: [],
      images: [],
      textElements: [],
      conditionals: [],
      lists: [],
      apiCalls: [],
      usesRouter: false,
      usesForm: false,
      hasLoadingState: false,
      hasErrorState: false,
    };

    this._current = comp;
    this._extractProps(node);
    if (node.body) this._analyzeBody(node.body);
    this._current = null;

    // Only include if it actually renders something (has JSX)
    if (comp.buttons.length > 0 || comp.inputs.length > 0 || comp.textElements.length > 0 ||
        comp.forms.length > 0 || comp.links.length > 0 || comp.images.length > 0 ||
        comp.lists.length > 0) {
      this.components.push(comp);
    }

    return comp;
  }

  _extractProps(node) {
    const ts = this.ts;
    const params = node.parameters || [];
    if (params.length === 0) return;

    const first = params[0];

    // Destructured: ({ title, onSubmit, ...rest })
    if (ts.isObjectBindingPattern(first.name)) {
      for (const el of first.name.elements) {
        if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) {
          const pName = el.name.text;
          const hasDefault = !!el.initializer;
          const defaultVal = hasDefault ? this._text(el.initializer).trim() : null;
          this._current.props.push({
            name: pName,
            type: this._inferType(pName, defaultVal),
            required: !hasDefault,
            defaultValue: defaultVal,
            isCallback: /^on[A-Z]/.test(pName),
            isBoolean: /^(is|has|show|can|should)[A-Z]/.test(pName) ||
                        defaultVal === 'true' || defaultVal === 'false',
          });
        }
      }
    }

    // Type annotation: (props: MyProps)
    if (first.type) {
      const typeName = this._getTypeRefName(first.type);
      if (typeName && this.typeDefinitions.has(typeName)) {
        const typeDef = this.typeDefinitions.get(typeName);
        for (const td of typeDef) {
          const existing = this._current.props.find(p => p.name === td.name);
          if (existing) {
            existing.type = td.type;
            if (td.required && !existing.required) existing.required = false;
          } else {
            this._current.props.push({ ...td, defaultValue: null });
          }
        }
      }
    }
  }

  _analyzeBody(body) {
    const ts = this.ts;
    const comp = this._current;

    const visit = (node) => {
      // ── Hooks ──
      if (ts.isCallExpression(node)) {
        const name = this._callName(node);

        if (name === 'useState') {
          const parent = node.parent;
          if (ts.isVariableDeclaration(parent) && ts.isArrayBindingPattern(parent.name)) {
            const [stateEl, setterEl] = parent.name.elements;
            const sName = stateEl && ts.isBindingElement(stateEl) ? stateEl.name?.text : null;
            const setter = setterEl && ts.isBindingElement(setterEl) ? setterEl.name?.text : null;
            const initial = node.arguments[0] ? this._text(node.arguments[0]).trim() : 'undefined';
            if (sName) {
              comp.state.push({ name: sName, setter, initialValue: initial });
              // Detect loading/error state patterns
              if (/loading|isLoading|fetching/i.test(sName)) comp.hasLoadingState = true;
              if (/error|isError|err/i.test(sName)) comp.hasErrorState = true;
            }
          }
        }

        if (name === 'useEffect' || name === 'useLayoutEffect') {
          const deps = node.arguments[1];
          const depList = [];
          if (deps && ts.isArrayLiteralExpression(deps)) {
            for (const el of deps.elements) depList.push(this._text(el).trim());
          }
          comp.effects.push({
            deps: depList,
            isEmpty: deps && ts.isArrayLiteralExpression(deps) && deps.elements.length === 0,
          });
        }

        if (name === 'useRef') {
          const parent = node.parent;
          if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
            comp.refs.push(parent.name.text);
          }
        }

        if (name === 'useNavigate' || name === 'useLocation' || name === 'useParams' ||
            name === 'useSearchParams') {
          comp.usesRouter = true;
        }

        if (name === 'useForm') comp.usesForm = true;

        // Context usage: useXxxContext() or useContext(XxxContext)
        if (name && /^use\w+Context$/.test(name)) {
          comp.contexts.push(name);
        }
        if (name === 'useContext' && node.arguments[0]) {
          comp.contexts.push(this._text(node.arguments[0]).trim());
        }

        // Custom hooks (use*)
        if (name && /^use[A-Z]/.test(name) && !this._isBuiltinHook(name)) {
          comp.customHooks.push(name);
        }

        // API calls
        if (['fetch', 'axios'].includes(name) ||
            (name && /\.(get|post|put|delete|patch)$/i.test(name))) {
          comp.apiCalls.push(name);
        }
      }

      // ── Handler functions ──
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer) {
            const fname = decl.name.text;
            if (/^(handle|on)[A-Z]/.test(fname) && !this._isCompName(fname)) {
              const fn = this._unwrapCallback(decl.initializer);
              if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
                const isAsync = fn.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword);
                comp.handlers.push({ name: fname, isAsync: !!isAsync });
              }
            }
          }
        }
      }

      // ── JSX Elements ──
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        this._analyzeJSX(node);
      }

      // ── Conditional rendering: {condition && <JSX>} or {cond ? <A> : <B>} ──
      if (ts.isConditionalExpression(node)) {
        const condition = this._text(node.condition).trim();
        if (condition.length < 100) { // Skip overly complex conditions
          comp.conditionals.push({
            condition,
            hasTrueBranch: this._containsJSX(node.whenTrue),
            hasFalseBranch: this._containsJSX(node.whenFalse),
          });
        }
      }
      if (ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        const condition = this._text(node.left).trim();
        if (condition.length < 100 && this._containsJSX(node.right)) {
          comp.conditionals.push({ condition, hasTrueBranch: true, hasFalseBranch: false });
        }
      }

      // ── Array .map() for lists ──
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name?.text;
        if (method === 'map' && node.arguments[0]) {
          const cb = node.arguments[0];
          if (this._containsJSX(cb)) {
            const arrName = this._text(node.expression.expression).trim();
            comp.lists.push(arrName);
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(body);
  }

  _analyzeJSX(node) {
    const ts = this.ts;
    const tag = this._getTag(node);
    const attrs = this._getAttrs(node);
    const text = this._getJSXText(node);

    // Buttons
    if (tag === 'button' || tag === 'Button' || attrs.role === 'button' || attrs.type === 'submit') {
      this._current.buttons.push({
        text: text || attrs['aria-label'] || '',
        type: attrs.type || 'button',
        ariaLabel: attrs['aria-label'],
        onClick: attrs.onClick || attrs.onPress,
        disabled: attrs.disabled,
        testId: attrs['data-testid'],
      });
    }

    // Inputs
    if (['input', 'Input', 'textarea', 'Textarea', 'select', 'Select'].includes(tag)) {
      this._current.inputs.push({
        type: attrs.type || (tag.toLowerCase() === 'textarea' ? 'textarea' : 'text'),
        name: attrs.name,
        label: attrs.label || attrs['aria-label'],
        placeholder: attrs.placeholder,
        required: attrs.required,
      });
    }

    // Forms
    if (tag === 'form') {
      this._current.forms.push({ onSubmit: attrs.onSubmit });
    }

    // Links
    if (tag === 'a' || tag === 'Link' || tag === 'NavLink') {
      this._current.links.push({ text, href: attrs.href || attrs.to });
    }

    // Images
    if (tag === 'img') {
      this._current.images.push({ alt: attrs.alt, src: attrs.src });
    }

    // Text content for "renders text" tests
    if (text && text.length > 1 && text.length < 100 && !['button', 'Button', 'a', 'Link'].includes(tag)) {
      this._current.textElements.push(text);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════

  _getTag(node) {
    const opening = node.openingElement || node;
    if (!opening.tagName) return 'unknown';
    if (this.ts.isIdentifier(opening.tagName)) return opening.tagName.text;
    if (this.ts.isPropertyAccessExpression(opening.tagName)) {
      return `${this._text(opening.tagName.expression).trim()}.${opening.tagName.name.text}`;
    }
    return 'unknown';
  }

  _getAttrs(node) {
    const ts = this.ts;
    const attrs = {};
    const el = node.openingElement || node;
    if (!el.attributes?.properties) return attrs;
    for (const attr of el.attributes.properties) {
      if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name)) {
        const n = attr.name.text;
        if (!attr.initializer) { attrs[n] = 'true'; continue; }
        if (ts.isStringLiteral(attr.initializer)) { attrs[n] = attr.initializer.text; continue; }
        if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
          attrs[n] = this._text(attr.initializer.expression).trim();
        }
      }
    }
    return attrs;
  }

  _getJSXText(node) {
    let text = '';
    if (node.children) {
      for (const child of node.children) {
        if (this.ts.isJsxText(child)) text += child.text.trim();
      }
    }
    return text;
  }

  _containsJSX(node) {
    const ts = this.ts;
    let found = false;
    const check = (n) => {
      if (found) return;
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
        found = true;
        return;
      }
      ts.forEachChild(n, check);
    };
    check(node);
    return found;
  }

  _unwrapCallback(node) {
    const ts = this.ts;
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return node;
    if (ts.isCallExpression(node)) {
      const name = this._callName(node);
      if (name === 'useCallback' || name === 'useMemo') return node.arguments[0] || null;
    }
    return null;
  }

  _callName(node) {
    const e = node.expression;
    if (this.ts.isIdentifier(e)) return e.text;
    if (this.ts.isPropertyAccessExpression(e)) {
      return `${this._text(e.expression).trim()}.${e.name.text}`;
    }
    return null;
  }

  _isBuiltinHook(name) {
    return [
      'useState', 'useEffect', 'useContext', 'useReducer', 'useCallback',
      'useMemo', 'useRef', 'useLayoutEffect', 'useImperativeHandle',
      'useDebugValue', 'useId', 'useTransition', 'useDeferredValue',
      'useSyncExternalStore', 'useInsertionEffect',
      'useNavigate', 'useLocation', 'useParams', 'useSearchParams',
      'useForm', 'useQuery', 'useMutation', 'useQueryClient',
    ].includes(name);
  }

  _isCompName(name) { return /^[A-Z]/.test(name); }

  _hasExport(node) {
    return node.modifiers?.some(m => m.kind === this.ts.SyntaxKind.ExportKeyword) ?? false;
  }

  _hasDefault(node) {
    return node.modifiers?.some(m => m.kind === this.ts.SyntaxKind.DefaultKeyword) ?? false;
  }

  _isExportedElsewhere(name) {
    const text = this.sourceCode;
    return new RegExp(`export\\s+(default\\s+)?${name}\\b`).test(text) ||
           new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(text);
  }

  _isDefaultElsewhere(name) {
    return new RegExp(`export\\s+default\\s+${name}\\b`).test(this.sourceCode);
  }

  _getTypeRefName(typeNode) {
    if (this.ts.isTypeReferenceNode(typeNode) && this.ts.isIdentifier(typeNode.typeName)) {
      return typeNode.typeName.text;
    }
    return null;
  }

  _inferType(name, defaultVal) {
    if (defaultVal === 'true' || defaultVal === 'false') return 'boolean';
    if (defaultVal && !isNaN(defaultVal)) return 'number';
    if (defaultVal?.startsWith("'") || defaultVal?.startsWith('"')) return 'string';
    if (defaultVal?.startsWith('[')) return 'array';
    if (defaultVal?.startsWith('{')) return 'object';
    if (/^on[A-Z]/.test(name)) return 'function';
    if (/^(is|has|show|can|should)/.test(name)) return 'boolean';
    return 'unknown';
  }

  _text(node) {
    return this.sourceCode.substring(node.pos, node.end);
  }
}
