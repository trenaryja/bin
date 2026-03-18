import chalk from "chalk";

type TuiHeadingOptions = {
  repeat?: string;
  count?: number;
  messageStyle?: (s: string) => string;
  ruleStyle?: (s: string) => string;
};

export const tuiHeading = (
  message: string,
  {
    repeat = "─",
    count = 25,
    messageStyle = chalk.cyan,
    ruleStyle = chalk.dim,
  }: TuiHeadingOptions = {},
): void => {
  const rule = repeat.repeat(count);
  console.log(ruleStyle(`\n${rule}`));
  console.log(messageStyle(message));
  console.log(ruleStyle(`${rule}\n`));
};
