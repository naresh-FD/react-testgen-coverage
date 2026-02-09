/**
 * PromptBuilder - Converts component analysis metadata into structured
 * prompts for LLM training and inference.
 *
 * The prompt format is:
 *   [INST] <component metadata + source code> [/INST]
 *   <expected test output>
 *
 * The metadata gives the LLM a "cheat sheet" so it knows what to test
 * without having to figure it all out from raw source code.
 */

export class PromptBuilder {

  /**
   * Build an instruction prompt for a component.
   * @param {object} comp - Analyzed component metadata
   * @param {string} sourceCode - Original TSX source code
   * @returns {string} The instruction part of the prompt
   */
  static buildInstruction(comp, sourceCode) {
    const sections = [];

    sections.push(`Generate a comprehensive Jest + React Testing Library test file for the following React component.`);
    sections.push(`The tests should achieve at least 50% code coverage.\n`);

    // Component summary
    sections.push(`## Component: ${comp.name}`);
    if (comp.wrapper) sections.push(`Wrapper: ${comp.wrapper}`);

    // Props
    if (comp.props.length > 0) {
      sections.push(`\n## Props`);
      for (const p of comp.props) {
        const req = p.required ? 'required' : 'optional';
        const def = p.defaultValue ? ` (default: ${p.defaultValue})` : '';
        sections.push(`- ${p.name}: ${p.type} [${req}]${def}`);
      }
    }

    // State
    if (comp.state.length > 0) {
      sections.push(`\n## State Variables`);
      for (const s of comp.state) {
        sections.push(`- ${s.name} (initial: ${s.initialValue}) setter: ${s.setter}`);
      }
    }

    // Contexts
    if (comp.contexts.length > 0) {
      sections.push(`\n## Context Dependencies`);
      sections.push(`Uses: ${comp.contexts.join(', ')}`);
      sections.push(`NOTE: renderWithProviders already wraps all app providers. No extra mocking needed.`);
    }

    // Custom Hooks
    if (comp.customHooks.length > 0) {
      sections.push(`\n## Custom Hooks Used`);
      sections.push(comp.customHooks.join(', '));
    }

    // UI Elements
    if (comp.buttons.length > 0) {
      sections.push(`\n## Buttons`);
      for (const b of comp.buttons) {
        const label = b.ariaLabel || b.text || 'unlabeled';
        sections.push(`- "${label}" (type: ${b.type}${b.onClick ? ', onClick: ' + b.onClick : ''})`);
      }
    }

    if (comp.inputs.length > 0) {
      sections.push(`\n## Inputs`);
      for (const i of comp.inputs) {
        sections.push(`- type=${i.type}${i.label ? ' label="' + i.label + '"' : ''}${i.placeholder ? ' placeholder="' + i.placeholder + '"' : ''}`);
      }
    }

    if (comp.forms.length > 0) {
      sections.push(`\n## Forms`);
      sections.push(`Has ${comp.forms.length} form(s)${comp.usesForm ? ' (uses react-hook-form)' : ''}`);
    }

    // Handlers
    if (comp.handlers.length > 0) {
      sections.push(`\n## Event Handlers`);
      for (const h of comp.handlers) {
        sections.push(`- ${h.name}${h.isAsync ? ' (async)' : ''}`);
      }
    }

    // Conditional rendering
    if (comp.conditionals.length > 0) {
      sections.push(`\n## Conditional Rendering`);
      for (const c of comp.conditionals) {
        sections.push(`- Condition: ${c.condition} → renders JSX${c.hasFalseBranch ? ' (has else branch)' : ''}`);
      }
    }

    // Lists
    if (comp.lists.length > 0) {
      sections.push(`\n## Lists/Iterations`);
      sections.push(`Maps over: ${comp.lists.join(', ')}`);
    }

    // Loading/Error states
    if (comp.hasLoadingState) sections.push(`\n## Has loading state`);
    if (comp.hasErrorState) sections.push(`\n## Has error state`);

    // Effects
    if (comp.effects.length > 0) {
      sections.push(`\n## Effects`);
      for (const e of comp.effects) {
        sections.push(`- useEffect(deps: [${e.deps.join(', ')}])${e.isEmpty ? ' — runs once on mount' : ''}`);
      }
    }

    // Router
    if (comp.usesRouter) sections.push(`\n## Uses React Router (renderWithProviders includes MemoryRouter)`);

    // Source code
    sections.push(`\n## Source Code`);
    sections.push('```tsx');
    sections.push(sourceCode.trim());
    sections.push('```');

    // Test requirements
    sections.push(`\n## Test Requirements`);
    sections.push(`- Use renderWithProviders from test-utils (wraps all providers + MemoryRouter)`);
    sections.push(`- Mock framer-motion, lucide-react icons, and recharts if imported`);
    sections.push(`- Use screen queries (getByRole, getByText, getByLabelText, getByTestId)`);
    sections.push(`- Use userEvent for interactions (click, type, etc.)`);
    sections.push(`- Test: rendering, props, interactions, conditional branches, loading/error states`);
    sections.push(`- Provide realistic mock data matching the TypeScript types`);
    sections.push(`- Each test should assert something meaningful (no empty tests)`);

    return sections.join('\n');
  }

  /**
   * Build a complete training example in ChatML / Alpaca format.
   */
  static buildTrainingPair(comp, sourceCode, testCode) {
    return {
      instruction: this.buildInstruction(comp, sourceCode),
      output: testCode.trim(),
    };
  }

  /**
   * Convert training pair to the format expected by the fine-tuning script.
   * Uses ChatML template compatible with DeepSeek Coder.
   */
  static toChatML(pair) {
    return {
      messages: [
        {
          role: 'system',
          content: 'You are a React testing expert. You generate comprehensive Jest + React Testing Library test files for React components. Your tests are production-quality, use best practices, and achieve high code coverage.',
        },
        {
          role: 'user',
          content: pair.instruction,
        },
        {
          role: 'assistant',
          content: pair.output,
        },
      ],
    };
  }

  /**
   * Build inference prompt (no expected output).
   */
  static buildInferencePrompt(comp, sourceCode) {
    return this.buildInstruction(comp, sourceCode);
  }
}
