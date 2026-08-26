function formatNumber(value: number): string {
  const rounded = Number(value.toFixed(10));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function parseArithmeticExpression(expression: string): number | null {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/]/g);
  if (!tokens || tokens.join('') !== expression.replace(/\s+/g, '')) return null;

  let position = 0;
  const parseExpression = (): number | null => {
    let value = parseTerm();
    while (value !== null && (tokens[position] === '+' || tokens[position] === '-')) {
      const operator = tokens[position++];
      const right = parseTerm();
      if (right === null) return null;
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };

  const parseTerm = (): number | null => {
    let value = parseFactor();
    while (value !== null && (tokens[position] === '*' || tokens[position] === '/')) {
      const operator = tokens[position++];
      const right = parseFactor();
      if (right === null || (operator === '/' && right === 0)) return null;
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };

  const parseFactor = (): number | null => {
    if (tokens[position] === '+') {
      position += 1;
      return parseFactor();
    }
    if (tokens[position] === '-') {
      position += 1;
      const value = parseFactor();
      return value === null ? null : -value;
    }
    if (tokens[position] === '(') {
      position += 1;
      const value = parseExpression();
      if (tokens[position] !== ')') return null;
      position += 1;
      return value;
    }

    const token = tokens[position++];
    return token && /^\d+(?:\.\d+)?$/.test(token) ? Number(token) : null;
  };

  const value = parseExpression();
  return value !== null && position === tokens.length && Number.isFinite(value) ? value : null;
}

export function getDeterministicAnswer(input: string): string | null {
  const text = input.trim().replace(/[?!.]+$/, '').trim();
  const percentageMatch = text.match(/^(?:what is\s+)?(\d+(?:\.\d+)?)%\s+of\s+(\d+(?:\.\d+)?)$/i);
  if (percentageMatch) {
    return formatNumber((Number(percentageMatch[1]) / 100) * Number(percentageMatch[2]));
  }

  const expression = text.replace(/^what is\s+/i, '').replace(/^calculate\s+/i, '').trim();
  if (expression.length === 0 || expression.length > 100 || !/^[\d\s()+\-*/.]+$/.test(expression)) return null;

  const value = parseArithmeticExpression(expression);
  return value === null ? null : formatNumber(value);
}
