class ReactiveStore {
    constructor(initialValues = {}) {
        // Store for reactive values
        this.store = {};
        // Map to track variable references: { varName: Set(nodes) }
        this.references = new Map();
        // Store original templates for each node
        this.templates = new WeakMap();
        // Store attribute templates for each node
        this.attributeTemplates = new WeakMap();
        this.dependencies = new Map();

        this._listeners = {};

        // Initialize store with initial values
        Object.entries(initialValues).forEach(([key, value]) => {
            this.store[key] = value;
        });

        // Create proxy for reactive updates
        const self = this;
        this.rs = new Proxy(this.store, {
            get(target, prop) {
                return target[prop];
            },
            set(target, prop, value) {
                console.log('set', prop, value);
                // Track dependencies before updating the value
                self.trackDependencies(prop, value);

                const oldValue = target[prop];
                target[prop] = value;
                self.updateVariable(prop, value);

                self.emit('change', prop, oldValue, value);

                return true;
            }
        });

        // Initial DOM scan - scan both head and body
        this.scanDOM(document.head);
        this.scanDOM(document.body);

        // Return public API
        return {
            store: this,
            rs: this.rs
        };
    }

    // Listener registrieren
    on(event, callback) {
        if (!this._listeners[event]) {
            this._listeners[event] = [];
        }
        this._listeners[event].push(callback);
    }

    // Listener abmelden (optional)
    off(event, callback) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    }

    // Event auslösen
    emit(event, ...args) {
        if (!this._listeners[event]) return;
        this._listeners[event].forEach(cb => cb(...args));
    }

    trackDependencies(varName, value) {
        // Clear any existing dependencies where this variable is a dependent
        this.dependencies.forEach((dependents, key) => {
            if (dependents.has(varName)) {
                dependents.delete(varName);
            }
        });

        // If the value is a string with variables, track the dependencies
        if (typeof value === 'string' && value.includes('{')) {
            const varRegex = /\{([^}]+)\}/g;
            let match;
            while ((match = varRegex.exec(value)) !== null) {
                const depVar = match[1].trim();
                // Only track if the dependency exists in the store
                if (depVar in this.store) {
                    if (!this.dependencies.has(depVar)) {
                        this.dependencies.set(depVar, new Set());
                    }
                    this.dependencies.get(depVar).add(varName);

                    // If the dependency is itself a reference, track that too
                    const depValue = this.store[depVar];
                    if (typeof depValue === 'string' && depValue.startsWith('{') && depValue.endsWith('}')) {
                        const nextDep = depValue.slice(1, -1).trim();
                        if (nextDep in this.store && nextDep !== depVar) {
                            if (!this.dependencies.has(nextDep)) {
                                this.dependencies.set(nextDep, new Set());
                            }
                            this.dependencies.get(nextDep).add(varName);
                        }
                    }
                }
            }
        }
    }

    // Scan a node/subtree for reactivity (for dynamic DOM changes)
    reparse(node) {
        // rs-if
        node.querySelectorAll?.('[rs-if]').forEach(el => {
            const varName = el.getAttribute('rs-if').trim();
            if (!this.references.has(varName)) this.references.set(varName, new Set());
            this.references.get(varName).add({ node: el, attribute: 'rs-if' });
        });

        // rs-for
        node.querySelectorAll?.('[rs-for]').forEach(el => {
            const expr = el.getAttribute('rs-for').trim();
            const [, arrName] = expr.match(/in\s+([\w.]+)/) || [];
            if (arrName) {
                if (!this.references.has(arrName)) this.references.set(arrName, new Set());
                this.references.get(arrName).add({ node: el, attribute: 'rs-for' });
            }
        });

        // Variable placeholders in text nodes
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
        let textNode;
        while (textNode = walker.nextNode()) {
            const matches = [...textNode.textContent.matchAll(/\{([^}]+)\}/g)];
            matches.forEach(match => {
                const varName = match[1];
                if (!this.references.has(varName)) this.references.set(varName, new Set());
                this.references.get(varName).add({ node: textNode, attribute: 'text' });
                
                // If this is an array access expression, also track the index variable
                const arrayMatch = varName.match(/^([^\[]+)\[([^\]]+)\]$/);
                if (arrayMatch) {
                    const arrayName = arrayMatch[1].trim();
                    const indexVar = arrayMatch[2].trim();
                    
                    // Track the array itself
                    if (!this.references.has(arrayName)) this.references.set(arrayName, new Set());
                    this.references.get(arrayName).add({ node: textNode, attribute: 'text' });
                    
                    // Track the index variable
                    if (!this.references.has(indexVar)) this.references.set(indexVar, new Set());
                    this.references.get(indexVar).add({ node: textNode, attribute: 'text' });
                }
            });
        }

        // Variable placeholders in attributes
        node.querySelectorAll?.('*').forEach(el => {
            for (const attr of el.attributes) {
                const matches = [...attr.value.matchAll(/\{([^}]+)\}/g)];
                matches.forEach(match => {
                    const varName = match[1];
                    if (!this.references.has(varName)) this.references.set(varName, new Set());
                    this.references.get(varName).add({ node: el, attribute: attr.name });
                    
                    // If this is an array access expression, also track the index variable
                    const arrayMatch = varName.match(/^([^\[]+)\[([^\]]+)\]$/);
                    if (arrayMatch) {
                        const arrayName = arrayMatch[1].trim();
                        const indexVar = arrayMatch[2].trim();
                        
                        // Track the array itself
                        if (!this.references.has(arrayName)) this.references.set(arrayName, new Set());
                        this.references.get(arrayName).add({ node: el, attribute: attr.name });
                        
                        // Track the index variable
                        if (!this.references.has(indexVar)) this.references.set(indexVar, new Set());
                        this.references.get(indexVar).add({ node: el, attribute: attr.name });
                    }
                });
            }
        });

        this.scanDOM(node);
    }

    // Scan DOM for variables
    scanDOM(root = document.body) {
        // Process text nodes and attributes
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        let textNode;
        while (textNode = walker.nextNode()) {
            const text = textNode.textContent;
            if (!text.includes('{')) continue;

            const parent = textNode.parentElement;
            if (!parent) continue;

            // Template speichern
            if (!this.templates.has(parent)) {
                this.templates.set(parent, parent.innerHTML);
            }

            // ALLE Variablen erfassen (auch Array-Zugriffe)
            const matches = text.matchAll(/\{([^}]+)\}/g);
            for (const match of matches) {
                const expr = match[1].trim();

                // Extrahiere Basis-Variable (z.B. "todos" aus "todos[0].checked")
                const baseVar = expr.match(/^(\w+)/)?.[1];

                if (baseVar) {
                    if (!this.references.has(baseVar)) {
                        this.references.set(baseVar, new Set());
                    }
                    this.references.get(baseVar).add({
                        node: parent,
                        attribute: 'innerHTML'
                    });
                }
            }
        }

        /**
         * Process an element with an rs-if directive
         * @param {Element} el - The element with the rs-if directive
         */
        root.querySelectorAll('[rs-if]').forEach(el => {
            const varName = el.getAttribute('rs-if').trim();
            if (!el._rs_if_template) el._rs_if_template = el.outerHTML;
            this.updateIfDirective(el, varName);
            if (!this.references.has(varName)) this.references.set(varName, new Set());
            this.references.get(varName).add({ node: el, attribute: 'rs-if' });
        });

        // rs-for
        root.querySelectorAll('[rs-for]').forEach(el => {
            const expr = el.getAttribute('rs-for').trim();
            // Speichere NUR das innere Template für die Items
            if (!el._rs_for_inner) el._rs_for_inner = el.innerHTML;
            this.updateForDirective(el, expr);
            // Extrahiere Array-Variable
            const [, arrName] = expr.match(/in\s+([\w.]+)/) || [];
            if (arrName) {
                if (!this.references.has(arrName)) this.references.set(arrName, new Set());
                this.references.get(arrName).add({ node: el, attribute: 'rs-for' });
            }
            el.innerHTML = '';
        });

        // rs-html - dynamic HTML content with reactive directives
        root.querySelectorAll('[rs-html]').forEach(el => {
            const varName = el.getAttribute('rs-html').trim();
            // Store reference for this variable
            if (!this.references.has(varName)) {
                this.references.set(varName, new Set());
            }
            this.references.get(varName).add({ node: el, attribute: 'rs-html' });
            // Initial render
            this.updateHtmlDirective(el, varName);
        });

        // Process all element attributes for variables
        root.querySelectorAll('*').forEach(el => {
            this.processElementNode(el);
        });

        // Update all variables after scanning
        Object.keys(this.store).forEach(key => {
            this.updateVariable(key, this.store[key]);
        });
    }

    // Helper method to resolve a path like 'todos[0].checked' to its value
    resolvePath(path) {
        if (!path) return undefined;

        // Handle array access like 'todos[0]' or nested properties like 'todos[0].checked'
        const parts = [];
        
        // Parse the path step by step
        // Match patterns like: varName, varName[0], varName[0].property, etc.
        let remaining = path;
        
        while (remaining.length > 0) {
            // Try to match: identifier followed by optional [index]
            const match = remaining.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)(\[(\d+)\])?\.?/);
            
            if (!match) {
                // If no match, we might have just a property name left
                if (remaining.length > 0) {
                    parts.push(remaining);
                }
                break;
            }
            
            const [fullMatch, identifier, , index] = match;
            
            // Add the identifier
            if (identifier) {
                parts.push(identifier);
            }
            
            // Add the index if present
            if (index !== undefined) {
                parts.push(parseInt(index, 10));
            }
            
            // Remove the matched part from remaining
            remaining = remaining.substring(fullMatch.length);
        }

        // Start with the root store
        let current = this.store;

        for (const part of parts) {
            if (current === null || current === undefined) {
                return undefined;
            }

            // Handle array indices and object properties
            current = current[part];
        }

        return current;
    }

    updateIfDirective(el, expr) {
        // Check for comparison operators
        // Match the left operand, operator, and right operand, handling spaces correctly
        const comparisonMatch = expr.match(/^\s*([^=!<>]+?)\s*(===|!==|==|!=|<=|>=|<|>)\s*(.*?)\s*$/);
        let show;

        if (comparisonMatch) {
            const [, left, operator, right] = comparisonMatch;

            // Try to resolve left value as a path first
            let leftValue = this.resolvePath(left.trim());
            // If not found as path, try direct property access
            if (leftValue === undefined) {
                leftValue = this.rs[left.trim()];
            }

            // Handle right side (could be a path, string, number, or other value)
            let rightValue = right.trim();

            // Check if right value is a quoted string
            const isQuotedString = (rightValue.startsWith("'") && rightValue.endsWith("'")) ||
                (rightValue.startsWith('"') && rightValue.endsWith('"'));

            if (isQuotedString) {
                // Remove the quotes for string comparison
                rightValue = rightValue.slice(1, -1);
            } else if (rightValue === 'true') {
                rightValue = true;
            } else if (rightValue === 'false') {
                rightValue = false;
            } else if (!isNaN(rightValue)) {
                // For non-quoted values that look like numbers, convert to number
                rightValue = Number(rightValue);
            } else {
                // Try to resolve as a path
                const resolvedRight = this.resolvePath(rightValue);
                if (resolvedRight !== undefined) {
                    rightValue = resolvedRight;
                }
            }

            // For strict equality (=== and !==), don't do additional type conversion
            const isStrict = operator === '===' || operator === '!==';

            if (!isStrict && !isQuotedString) {
                // For non-strict comparisons with non-string values, try to convert to numbers
                const leftNumeric = isNaN(leftValue) ? leftValue : Number(leftValue);
                const rightNumeric = isNaN(rightValue) ? rightValue : Number(rightValue);

                // Only use numeric conversion if the string representation matches exactly
                if (leftValue !== null && leftValue !== undefined && String(leftNumeric) === String(leftValue)) leftValue = leftNumeric;
                if (rightValue !== null && rightValue !== undefined && String(rightNumeric) === String(rightValue)) rightValue = rightNumeric;
            }

            // Special handling for null/undefined
            if (leftValue === null || leftValue === undefined) {
                switch (operator) {
                    case '==': show = leftValue == rightValue; break;
                    case '!=': show = leftValue != rightValue; break;
                    case '===': show = leftValue === rightValue; break;
                    case '!==': show = leftValue !== rightValue; break;
                    default: show = false;
                }
            } else {
                // Normal comparison for non-null/undefined values
                switch (operator) {
                    case '===': show = leftValue === rightValue; break;
                    case '==': show = leftValue == rightValue; break;
                    case '!==': show = leftValue !== rightValue; break;
                    case '!=': show = leftValue != rightValue; break;
                    case '<': show = leftValue < rightValue; break;
                    case '>': show = leftValue > rightValue; break;
                    case '<=': show = leftValue <= rightValue; break;
                    case '>=': show = leftValue >= rightValue; break;
                    default: show = false;
                }
            }
        } else {
            // For simple expressions without comparison, try to resolve as a path first
            show = this.resolvePath(expr.trim()) || this.rs[expr.trim()];
        }

        // Update the element's visibility
        el.classList.toggle('show', !!show);
        el.classList.toggle('hide', !show);
    }

    updateForDirective(el, expr) {
        const [_, itemName, arrName] = expr.match(/^(\w+)\s+in\s+([\w.]+)/) || [];
        if (!itemName || !arrName) return;
        const arr = this.rs[arrName];
        if (!Array.isArray(arr)) return;

        // Store the original template (only once)
        if (!el._rs_for_inner) {
            el._rs_for_inner = el.innerHTML;
            // Clear the container to prepare for dynamic content
            el.innerHTML = '';
        }

        // 1. Remove all DOM nodes that no longer exist in the array
        const existing = Array.from(el.querySelectorAll('[rs-for-index]'));
        existing.forEach(node => {
            const idx = Number(node.getAttribute('rs-for-index'));
            if (arr[idx] === undefined) node.remove();
        });

        // 2. Update or add new nodes
        arr.forEach((item, idx) => {
            let node = el.querySelector(`[rs-for-index="${idx}"]`);

            // Process the template with the current item data
            let html = el._rs_for_inner
                .replace(/\{item\.(\w+)\}/g, (m, p1) => item[p1] || '')
                .replace(/\{index\}/g, idx)
                .replace(/\{item\.index\}/g, idx)
                .replace(/\{item\}/g, typeof item === 'object' ? (item.title || '') : item); // Handle {item} for both objects and primitives

            // Process any other variables in the template
            html = html.replace(/\{([^}]+)\}/g, (m, v) => {
                // Skip if it was already processed as item.property
                if (v.startsWith('item.') || v === 'index' || v === 'item.index' || v === 'item') {
                    return m; // Return the original match to avoid double processing
                }
                return this.resolveValue(v);
            });

            if (node) {
                // Update existing node
                const temp = document.createElement('div');
                temp.innerHTML = html;

                // Replace the entire node to ensure all attributes are updated
                const newNode = temp.firstElementChild || document.createTextNode(html);
                if (newNode.nodeType === Node.ELEMENT_NODE) {
                    newNode.setAttribute('data-rs-for-clone', arrName);
                    newNode.setAttribute('rs-for-index', idx);
                    newNode.setAttribute('is-newly-added', 'no');
                    
                    // Process rs-* attributes
                    this.processRsAttributes(newNode, { item, index: idx });
                }

                node.parentNode.replaceChild(newNode, node);
            } else {
                // Insert new node
                const temp = document.createElement('div');
                temp.innerHTML = html;

                Array.from(temp.childNodes).forEach(clone => {
                    if (clone.nodeType === Node.ELEMENT_NODE) {
                        clone.setAttribute('data-rs-for-clone', arrName);
                        clone.setAttribute('rs-for-index', idx);
                        clone.setAttribute('is-newly-added', 'yes');
                        
                        // Process rs-* attributes
                        this.processRsAttributes(clone, { item, index: idx });
                    }
                    el.appendChild(clone);
                });
            }
        });
    }

    updateHtmlDirective(el, varName) {
        // Get the HTML content from the store
        let htmlContent = this.store[varName];
        
        if (typeof htmlContent !== 'string') {
            el.innerHTML = '';
            return;
        }

        // Track all variables used in the HTML content so we can re-render when they change
        // Only register references on the first call (marked by a flag on the element)
        if (!el._rs_html_tracked) {
            el._rs_html_tracked = true;
            
            // Extract all variable references from the HTML content
            const usedVars = new Set();
            const varRegexForTracking = /\{([^}]+)\}/g;
            let match;
            while ((match = varRegexForTracking.exec(htmlContent)) !== null) {
                const v = match[1].trim();
                // Skip loop-specific variables
                if (v.startsWith('item.') || v === 'item' || v === 'index') {
                    continue;
                }
                // Extract base variable (e.g., "todos" from "todos[0].checked")
                const baseVar = v.match(/^(\w+)/)?.[1];
                if (baseVar) {
                    usedVars.add(baseVar);
                }
            }

            // Register this element to be updated when any of the used variables change
            usedVars.forEach(baseVar => {
                if (!this.references.has(baseVar)) {
                    this.references.set(baseVar, new Set());
                }
                this.references.get(baseVar).add({ node: el, attribute: 'rs-html' });
            });
        }

        // First, replace all variable placeholders in the HTML content
        let processedHtml = htmlContent;
        let hasPlaceholders = true;
        let iterations = 0;
        const maxIterations = 10;

        do {
            hasPlaceholders = false;
            // Create a new regex instance in each iteration to avoid lastIndex issues
            const varRegex = /\{([^}]+)\}/g;
            processedHtml = processedHtml.replace(varRegex, (match, v) => {
                v = v.trim();

                // Skip loop-specific variables (item.*, item, index) - they should be processed by rs-for
                if (v.startsWith('item.') || v === 'item' || v === 'index') {
                    return match;
                }

                // Try to resolve as a path first (for array access like todos[0].checked)
                let resolvedValue = this.resolvePath(v);

                // If not found as path, try direct property access
                if (resolvedValue === undefined) {
                    resolvedValue = this.store[v];
                }

                if (resolvedValue === undefined) {
                    hasPlaceholders = true;
                    return match;
                }

                // Don't output objects as JSON - leave them empty
                if (typeof resolvedValue === 'object' && resolvedValue !== null) {
                    return '';
                }

                return this.sanitize(String(resolvedValue));
            });

            if (iterations++ > maxIterations) break;
        } while (hasPlaceholders);

        // Set the innerHTML with the processed content
        el.innerHTML = processedHtml;

        // Now process any rs-if directives in the inserted content
        el.querySelectorAll('[rs-if]').forEach(ifEl => {
            const expr = ifEl.getAttribute('rs-if').trim();
            
            // Store the template for this rs-if element
            if (!ifEl._rs_if_template) {
                ifEl._rs_if_template = ifEl.outerHTML;
            }
            
            // Update the directive
            this.updateIfDirective(ifEl, expr);
            
            // Extract base variable for tracking
            const baseVar = expr.match(/^(\w+)/)?.[1];
            if (baseVar) {
                if (!this.references.has(baseVar)) {
                    this.references.set(baseVar, new Set());
                }
                this.references.get(baseVar).add({ node: ifEl, attribute: 'rs-if' });
            }
        });

        // Process any rs-for directives in the inserted content
        el.querySelectorAll('[rs-for]').forEach(forEl => {
            const expr = forEl.getAttribute('rs-for').trim();
            
            // Store the inner template and clear the element
            if (!forEl._rs_for_inner) {
                forEl._rs_for_inner = forEl.innerHTML;
                forEl.innerHTML = ''; // Clear the template content
            }
            
            // Update the directive
            this.updateForDirective(forEl, expr);
            
            // Extract array variable for tracking
            const [, arrName] = expr.match(/in\s+([\w.]+)/) || [];
            if (arrName) {
                if (!this.references.has(arrName)) {
                    this.references.set(arrName, new Set());
                }
                this.references.get(arrName).add({ node: forEl, attribute: 'rs-for' });
            }
        });
    }

    resolveValue(key, visited = new Set()) {
        // Zyklische Referenzen verhindern
        if (visited.has(key)) return `{${key}}`;
        visited.add(key);

        // Check if key contains array access like pageTitle[activePage]
        if (key.includes('[') && key.includes(']')) {
            try {
                // Extract the array name and index expression
                const match = key.match(/^([^\[]+)\[([^\]]+)\]$/);
                if (match) {
                    const arrayName = match[1].trim();
                    const indexExpr = match[2].trim();
                    
                    // Get the array from store
                    const array = this.store[arrayName];
                    if (Array.isArray(array)) {
                        // Resolve the index (it might be a variable like 'activePage')
                        const index = this.store[indexExpr] !== undefined ? this.store[indexExpr] : indexExpr;
                        return array[index];
                    }
                }
            } catch (e) {
                console.warn(`Failed to resolve array access: ${key}`, e);
            }
        }

        let value = this.store[key];
        if (typeof value !== 'string') return value;

        // Ersetze alle Platzhalter im Wert rekursiv
        return value.replace(/\{([^}]+)\}/g, (match, varName) => {
            varName = varName.trim();
            if (this.store[varName] !== undefined) {
                return this.resolveValue(varName, new Set(visited));
            }
            return match; // Unbekannte Variable bleibt als Platzhalter stehen
        });
    }

    // Process rs-* attributes (like rs-checked, rs-disabled, etc.)
    processRsAttributes(element, context = {}) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return;

        // Process all elements including nested ones
        const elements = [element, ...element.querySelectorAll('*')];
        
        elements.forEach(el => {
            const attributes = Array.from(el.attributes);
            
            attributes.forEach(attr => {
                // Check if attribute starts with 'rs-' but is not rs-if, rs-for, rs-html, etc.
                if (attr.name.startsWith('rs-') && !['rs-if', 'rs-for', 'rs-html', 'rs-for-index'].includes(attr.name)) {
                    const targetAttr = attr.name.substring(3); // Remove 'rs-' prefix
                    const expression = attr.value;
                    
                    // Evaluate the expression
                    const result = this.evaluateExpression(expression, context);
                    
                    // Set or remove the target attribute based on the result
                    if (result === true || result === 'checked' || result === 'disabled' || result === 'selected') {
                        el.setAttribute(targetAttr, targetAttr);
                    } else if (result === false || result === '' || result === null || result === undefined) {
                        el.removeAttribute(targetAttr);
                    } else {
                        el.setAttribute(targetAttr, result);
                    }
                    
                    // Remove the rs-* attribute after processing
                    el.removeAttribute(attr.name);
                }
            });
        });
    }

    // Evaluate expressions like "item === theme" in templates
    evaluateExpression(expr, context = {}) {
        try {
            // Replace variables in the expression with their values
            let evaluableExpr = expr.trim();
            
            // First, handle context variables (item, index from rs-for)
            Object.keys(context).forEach(key => {
                const value = context[key];
                const regex = new RegExp(`\\b${key}\\b`, 'g');
                // Wrap strings in quotes for evaluation
                const replacement = typeof value === 'string' ? `"${value.replace(/"/g, '\\"')}"` : value;
                evaluableExpr = evaluableExpr.replace(regex, replacement);
            });
            
            // Then, handle store variables
            Object.keys(this.store).forEach(key => {
                const regex = new RegExp(`\\b${key}\\b`, 'g');
                if (evaluableExpr.match(regex)) {
                    const value = this.store[key];
                    // Wrap strings in quotes for evaluation
                    const replacement = typeof value === 'string' ? `"${value.replace(/"/g, '\\"')}"` : value;
                    evaluableExpr = evaluableExpr.replace(regex, replacement);
                }
            });
            
            // Safely evaluate the expression
            const result = Function(`"use strict"; return (${evaluableExpr})`)();
            
            return result;
        } catch (e) {
            console.warn(`Failed to evaluate expression: ${expr}`, e);
            return '';
        }
    }

    // Process text node for variables
    processTextNode(node) {
        const text = node.nodeValue;
        if (!text.includes('{')) return;

        const parent = node.parentElement;
        if (!parent) return;

        // Store original template if it's not already stored
        if (!this.templates.has(parent)) {
            // For text nodes, we need to store the parent's innerHTML
            // but only if it's not already stored to prevent overwriting
            this.templates.set(parent, parent.innerHTML);
        }

        // Find all variables in text
        const matches = text.match(/\{([^}]+)\}/g) || [];
        matches.forEach(match => {
            const varName = match.slice(1, -1).trim();
            if (varName) {
                this.addReference(varName, parent, 'innerHTML');
            }
        });

        // If the text node contains HTML, we need to process it for directives
        if (text.includes('<') && text.includes('>')) {
            // Create a temporary parent to hold the HTML
            const tempParent = document.createElement('div');
            tempParent.innerHTML = text;

            // Check if there are any elements with rs-if or rs-for
            const hasDirectives = tempParent.querySelector('[rs-if],[rs-for]');
            if (hasDirectives) {
                // Process the HTML content for directives
                const processedHtml = this.processHtmlContent(text, parent);

                // Only update if the content has changed
                if (processedHtml !== text) {
                    // Replace the text node with the processed HTML
                    const range = document.createRange();
                    range.selectNode(node);
                    const fragment = range.createContextualFragment(processedHtml);
                    node.parentNode.replaceChild(fragment, node);
                    return; // Exit as we've replaced the node
                }
            }
        }
    }

    // Process element node attributes for variables
    processElementNode(node) {
        // Process attributes
        Array.from(node.attributes).forEach(attr => {
            if (attr.value.includes('{') && attr.value.includes('}')) {
                // Store attribute template
                if (!this.attributeTemplates.has(node)) {
                    this.attributeTemplates.set(node, new Map());
                }
                const nodeTemplates = this.attributeTemplates.get(node);
                nodeTemplates.set(attr.name, attr.value);

                // Find all variables in attribute
                const matches = attr.value.match(/\{([^}]+)\}/g) || [];
                matches.forEach(match => {
                    const varName = match.slice(1, -1).trim();
                    if (varName) {
                        this.addReference(varName, node, attr.name);
                    }
                });
            }
        });
    }

    // Add reference to a variable
    addReference(varName, node, attribute) {
        if (!this.references.has(varName)) {
            this.references.set(varName, new Set());
        }
        this.references.get(varName).add({ node, attribute });
    }

    // Update all references to a variable
    updateVariable(varName, value, processed = new Set()) {
        // Prevent circular references
        if (processed.has(varName)) return;
        processed.add(varName);

        // If this is a reference to another variable, resolve it
        let resolvedValue = value;
        if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
            const refVar = value.slice(1, -1).trim();
            if (refVar in this.store && refVar !== varName) {
                // Track this dependency
                if (!this.dependencies.has(refVar)) {
                    this.dependencies.set(refVar, new Set());
                }
                this.dependencies.get(refVar).add(varName);

                // Recursively resolve the reference
                resolvedValue = this.store[refVar];
                if (typeof resolvedValue === 'string' && resolvedValue.startsWith('{') && resolvedValue.endsWith('}')) {
                    // If it's another reference, resolve it
                    const nextRef = resolvedValue.slice(1, -1).trim();
                    if (nextRef in this.store && nextRef !== varName && nextRef !== refVar) {
                        this.updateVariable(nextRef, this.store[nextRef], new Set(processed));
                    }
                }
            }
        }

        // Update all direct references and expressions containing the variable
        const allReferences = [];

        // Get direct references
        if (this.references.has(varName)) {
            allReferences.push(...this.references.get(varName));
        }

        // Also check all rs-if expressions that might contain this variable
        const ifNodes = document.querySelectorAll('[rs-if]');
        ifNodes.forEach(node => {
            const expr = node.getAttribute('rs-if');
            // Use regex to match whole words only to avoid partial matches
            const varRegex = new RegExp(`\\b${varName}\\b`);
            if (varRegex.test(expr)) {
                allReferences.push({ node, attribute: 'rs-if' });
            }
        });

        // Process all collected references
        allReferences.forEach(({ node, attribute }) => {
            if (attribute === 'rs-if') {
                // Get the full expression from the rs-if attribute
                const expr = node.getAttribute('rs-if');
                this.updateIfDirective(node, expr);
            } else if (attribute === 'rs-for') {
                // Get the expression from the attribute
                const expr = node.getAttribute('rs-for');
                this.updateForDirective(node, expr);
            } else if (attribute === 'rs-html') {
                // Handle rs-html directive - use the variable name from the rs-html attribute
                const htmlVarName = node.getAttribute('rs-html');
                if (htmlVarName) {
                    this.updateHtmlDirective(node, htmlVarName.trim());
                }
            } else if (attribute === 'innerHTML') {
                this.updateNodeContent(node, varName, value);
            } else {
                this.updateNodeAttribute(node, attribute, varName, value);
            }
        });

        // Also update any variables that depend on this one
        if (this.dependencies.has(varName)) {
            this.dependencies.get(varName).forEach(dependentVar => {
                if (this.store[dependentVar] !== undefined && !processed.has(dependentVar)) {
                    this.updateVariable(dependentVar, this.store[dependentVar], new Set(processed));
                }
            });
        }

        // Also update any variables that depend on this one
        if (this.dependencies.has(varName)) {
            this.dependencies.get(varName).forEach(dependentVar => {
                if (this.store[dependentVar] !== undefined && !processed.has(dependentVar)) {
                    this.updateVariable(dependentVar, this.store[dependentVar], new Set(processed));
                }
            });
        }
    }


    // Process HTML content to handle rs-if directives and other reactive elements
    processHtmlContent(html, parentNode = null) {
        // Create a temporary container to parse the HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;

        // Process any rs-if directives in the new content
        temp.querySelectorAll('[rs-if]').forEach(el => {
            const expr = el.getAttribute('rs-if').trim();
            this.updateIfDirective(el, expr);
            // Store the reference for future updates
            if (!this.references.has(expr)) {
                this.references.set(expr, new Set());
            }
            this.references.get(expr).add({ node: el, attribute: 'rs-if' });
        });

        // Process any rs-for directives in the new content
        temp.querySelectorAll('[rs-for]').forEach(el => {
            const expr = el.getAttribute('rs-for').trim();
            this.updateForDirective(el, expr);
            // Store the reference for future updates
            const [, arrName] = expr.match(/in\s+([\w.]+)/) || [];
            if (arrName) {
                if (!this.references.has(arrName)) {
                    this.references.set(arrName, new Set());
                }
                this.references.get(arrName).add({ node: el, attribute: 'rs-for' });
            }
        });

        // If a parent node is provided, process any text nodes for variable references
        if (parentNode) {
            const walker = document.createTreeWalker(
                temp,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let textNode;
            while (textNode = walker.nextNode()) {
                this.processTextNode(textNode);
            }

            // Process element attributes for variable references
            temp.querySelectorAll('*').forEach(el => {
                this.processElementNode(el);
            });
        }

        return temp.innerHTML;
    }

    updateNodeContent(node, varName, value) {
        const template = this.templates.get(node);
        if (!template) return;
    
        let newContent = template;
        const varRegex = /\{([^}]+)\}/g;
        let match;
        const allVars = new Set();
    
        while ((match = varRegex.exec(template)) !== null) {
            allVars.add(match[1].trim());
        }
    
        let hasPlaceholders = true;
        let iterations = 0;
        const maxIterations = 10;
    
        do {
            hasPlaceholders = false;
    
            newContent = newContent.replace(varRegex, (match, v) => {
                v = v.trim();
    
                let resolvedValue = this.resolvePath(v);
    
                if (resolvedValue === undefined) {
                    resolvedValue = this.store[v];
                }
    
                if (resolvedValue === undefined) {
                    hasPlaceholders = true;
                    return match;
                }
    
                // Objekte NICHT als JSON ausgeben - leer lassen
                if (typeof resolvedValue === 'object' && resolvedValue !== null) {
                    return '';
                }
    
                return this.sanitize(String(resolvedValue));
            });
    
            if (iterations++ > maxIterations) break;
        } while (hasPlaceholders);
    
        // ERST JETZT processHtmlContent aufrufen - nach Variable-Replacement
        newContent = this.processHtmlContent(newContent, node);
        node.innerHTML = newContent;
        
        // WICHTIG: Nach dem Einfügen die neuen rs-if Elemente scannen
        node.querySelectorAll('[rs-if]').forEach(el => {
            const expr = el.getAttribute('rs-if').trim();
            this.updateIfDirective(el, expr);
            
            // Basis-Variable extrahieren für Tracking
            const baseVar = expr.match(/^(\w+)/)?.[1];
            if (baseVar) {
                if (!this.references.has(baseVar)) {
                    this.references.set(baseVar, new Set());
                }
                this.references.get(baseVar).add({ node: el, attribute: 'rs-if' });
            }
        });
    }

    // Apply the same changes to updateNodeAttribute
    updateNodeAttribute(node, attrName, varName, value) {
        const nodeTemplates = this.attributeTemplates.get(node);
        if (!nodeTemplates) return;

        const template = nodeTemplates.get(attrName);
        if (!template) return;

        // Get all variable names from the template
        const varRegex = /\{([^}]+)\}/g;
        let match;
        const allVars = new Set();
        while ((match = varRegex.exec(template)) !== null) {
            allVars.add(match[1].trim());
        }

        // Replace all variables in the template until no more placeholders
        let newValue = template;
        let hasPlaceholders;
        let iterations = 0;
        const maxIterations = 10; // Prevent infinite loops

        do {
            hasPlaceholders = false;
            allVars.forEach(v => {
                const resolved = this.sanitize(this.resolveValue(v));
                const placeholder = `{${v}}`;
                if (newValue.includes(placeholder)) {
                    newValue = newValue.replace(new RegExp(this.escapeRegExp(placeholder), 'g'), resolved);
                    hasPlaceholders = hasPlaceholders || String(resolved).includes('{');
                }
            });
            if (iterations++ > maxIterations) break;
        } while (hasPlaceholders);

        // Replace any remaining undefined variables with their placeholders
        newValue = newValue.replace(/\{([^}]+)\}/g, (match, v) => {
            return v in this.store ? this.sanitize(this.store[v]) : match;
        });

        node.setAttribute(attrName, newValue);
    }

    // Add this helper function at the class level
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    }

    // Sanitize variable values before inserting into DOM
    sanitize(value) {
        if (typeof value !== 'string') return value;
        // Remove dangerous tags (script, iframe, object, embed, link, style, meta, base, form)
        value = value.replace(/<(script|iframe|object|embed|link|style|meta|base|form)[^>]*>.*?<\/(script|iframe|object|embed|link|style|meta|base|form)>/gi, '');
        value = value.replace(/<(script|iframe|object|embed|link|style|meta|base|form)[^>]*\/?\s*>/gi, '');
        // Remove SVG with on* attributes
        value = value.replace(/<svg[^>]*on\w+="[^"]*"[^>]*>/gi, '');
        // Remove event handler attributes (onxxx)
        value = value.replace(/\son\w+="[^"]*"/gi, '');
        value = value.replace(/\son\w+='[^']*'/gi, '');
        // Remove javascript: and data: from attributes (href, src, action, style)
        value = value.replace(/(href|src|action|style)\s*=\s*(['"])\s*(javascript:|data:)[^'"]*\2/gi, '$1="#"');
        // Remove base64 images (optional)
        value = value.replace(/src\s*=\s*(['"])data:image\/[^"]*\1/gi, 'src="#"');
        return value;
    }
}