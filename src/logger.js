// Minimal levelled logger: error < warn < info < debug. error/warn go to stderr, the rest to stdout.
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function createLogger({ level = 'info', write = (lvl, line) => (LEVELS[lvl] <= 1 ? console.error : console.log)(line) } = {}) {
    let current = LEVELS[level];
    const log = (lvl) => (msg, ...args) => {
        if (LEVELS[lvl] > current) return;
        const extra = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
        write(lvl, `${new Date().toISOString()} ${lvl.toUpperCase().padEnd(5)} ${msg}${extra ? ` ${extra}` : ''}`);
    };
    return {
        error: log('error'),
        warn: log('warn'),
        info: log('info'),
        debug: log('debug'),
        isDebug: () => current >= LEVELS.debug,
        setLevel(l) {
            if (!(l in LEVELS)) throw new Error(`niveau de log inconnu « ${l} » (${Object.keys(LEVELS).join(', ')})`);
            current = LEVELS[l];
        },
    };
}

module.exports = createLogger();
module.exports.createLogger = createLogger;
module.exports.LEVELS = LEVELS;
