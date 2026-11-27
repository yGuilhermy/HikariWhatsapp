function createBotNameMatcher(name, aliases, ...extraNames) {
    const names = [...new Set([name, ...extraNames, ...aliases.split(',')]
        .map(value => value.trim().normalize('NFC'))
        .filter(Boolean))];
    if (!names.length) return () => false;
    const escaped = names.map(value => value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&'));
    const word = '[\\p{L}\\p{M}\\p{N}\\p{Pc}]';
    const pattern = new RegExp('(?:^|[^' + word.slice(1, -1) + '])(?:' + escaped.join('|') + ')(?!' + word + ')', 'iu');
    return text => pattern.test(String(text || '').normalize('NFC'));
}

module.exports = { createBotNameMatcher };
