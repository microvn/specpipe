import chalk from 'chalk';

export const log = {
  info:  (msg) => console.log(chalk.blue('[INFO]'), msg),
  pass:  (msg) => console.log(chalk.green('[PASS]'), msg),
  fail:  (msg) => console.log(chalk.red('[FAIL]'), msg),
  warn:  (msg) => console.log(chalk.yellow('[WARN]'), msg),
  skip:  (msg) => console.log(chalk.gray('[SKIP]'), msg),
  copy:  (msg) => console.log(chalk.cyan('[COPY]'), msg),
  del:   (msg) => console.log(chalk.red('[DEL]'), ' ', msg),
  keep:  (msg) => console.log(chalk.green('[KEEP]'), msg),
  make:  (msg) => console.log(chalk.cyan('[MAKE]'), msg),
  adopt: (msg) => console.log(chalk.magenta('[ADOPT]'), msg),
  same:  (msg) => console.log(chalk.gray('[SAME]'), msg),
  blank: ()    => console.log(),
};
