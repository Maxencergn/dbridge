import readline from "node:readline";

function numbered(title, labels) {
  console.log();
  console.log(title);
  labels.forEach((label, index) => {
    console.log(`  ${String(index + 1).padStart(2)}  ${label}`);
  });
  return ask("> ").then((raw) => {
    if (raw.toLowerCase() === "q") process.exit(0);
    const choice = Number(raw);
    if (!Number.isInteger(choice) || choice < 1 || choice > labels.length) {
      console.log("Invalid choice.");
      return numbered(title, labels);
    }
    return choice - 1;
  });
}

export function ask(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function attachKeys(onKey) {
  readline.emitKeypressEvents(process.stdin);
  process.stdin.ref();
  if (!process.stdin.isRaw) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("keypress", onKey);
  return () => {
    process.stdin.removeListener("keypress", onKey);
    if (process.stdin.isTTY && process.stdin.isRaw) process.stdin.setRawMode(false);
    process.stdout.write("\x1b[?25h");
  };
}

export function visibleRange(length, selected, rows) {
  const count = Math.min(length, Math.max(rows, 1));
  const start =
    length <= count ? 0 : Math.min(Math.max(selected - Math.floor(count / 2), 0), length - count);
  return { start, count };
}

function menuHeight() {
  return Math.max((process.stdout.rows || 24) - 3, 3);
}

function erase(lines) {
  if (!lines) return;
  process.stdout.write(`\x1b[${lines}A`);
  for (let index = 0; index < lines; index += 1) process.stdout.write("\x1b[2K\n");
  process.stdout.write(`\x1b[${lines}A`);
}

export function choose(title, labels) {
  if (!labels.length) return Promise.reject(new Error("No choices."));
  if (!process.stdin.isTTY || !process.stdout.isTTY) return numbered(title, labels);

  let selected = 0;
  let drawn = 0;
  const render = () => {
    const width = Math.max((process.stdout.columns || 80) - 4, 20);
    const range = visibleRange(labels.length, selected, menuHeight());
    const visible = labels.slice(range.start, range.start + range.count);
    const pad = Math.min(width, Math.max(...visible.map((label) => label.length), 1));
    drawn = visible.length + 2;
    process.stdout.write(`${title}\x1b[K\n`);
    visible.forEach((label, offset) => {
      const index = range.start + offset;
      const shown = label.slice(0, pad).padEnd(pad);
      const text = `${index === selected ? "›" : " "} ${shown}`;
      if (index === selected) process.stdout.write(`\x1b[7m${text}\x1b[0m\x1b[K\n`);
      else process.stdout.write(`${text}\x1b[K\n`);
    });
    const place = labels.length > range.count ? `  ${selected + 1}/${labels.length} · ` : "  ";
    process.stdout.write(`\x1b[2m${place}arrows, enter · q quit\x1b[0m\x1b[K\n`);
  };

  return new Promise((resolve) => {
    process.stdout.write("\n\x1b[?25l");
    const cleanup = attachKeys((str, key) => {
      if (!key) return;
      if (key.ctrl && key.name === "c") {
        erase(drawn);
        cleanup();
        process.stdout.write("\n");
        process.exit(130);
      }
      if (key.name === "up" || str === "k") selected = (selected - 1 + labels.length) % labels.length;
      else if (key.name === "down" || str === "j") selected = (selected + 1) % labels.length;
      else if (key.name === "return") {
        erase(drawn);
        cleanup();
        resolve(selected);
        return;
      } else if (str === "q" || key.name === "escape") {
        erase(drawn);
        cleanup();
        process.stdout.write("\n");
        process.exit(0);
      } else return;
      process.stdout.write(`\x1b[${drawn}A`);
      render();
    });
    render();
  });
}

export function chooseMany(title, labels) {
  if (!labels.length) return Promise.reject(new Error("No choices."));
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return numbered(title, labels).then((index) => [index]);
  }

  const chosen = new Set();
  let selected = 0;
  let drawn = 0;
  const render = () => {
    const range = visibleRange(labels.length, selected, menuHeight());
    const visible = labels.slice(range.start, range.start + range.count);
    drawn = visible.length + 2;
    process.stdout.write(`${title}\x1b[K\n`);
    visible.forEach((label, offset) => {
      const index = range.start + offset;
      const mark = chosen.has(index) ? "●" : "○";
      const text = `${index === selected ? "›" : " "} ${mark} ${label}`;
      if (index === selected) process.stdout.write(`\x1b[7m${text}\x1b[0m\x1b[K\n`);
      else process.stdout.write(`${text}\x1b[K\n`);
    });
    const place = labels.length > range.count ? `  ${selected + 1}/${labels.length} · ` : "  ";
    process.stdout.write(`\x1b[2m${place}space selects · enter confirms · q quit\x1b[0m\x1b[K\n`);
  };

  return new Promise((resolve) => {
    process.stdout.write("\n\x1b[?25l");
    const cleanup = attachKeys((str, key) => {
      if (!key) return;
      if (key.ctrl && key.name === "c") {
        erase(drawn);
        cleanup();
        process.stdout.write("\n");
        process.exit(130);
      }
      if (key.name === "up" || str === "k") selected = (selected - 1 + labels.length) % labels.length;
      else if (key.name === "down" || str === "j") selected = (selected + 1) % labels.length;
      else if (key.name === "space") {
        if (chosen.has(selected)) chosen.delete(selected);
        else chosen.add(selected);
      } else if (key.name === "return") {
        if (chosen.size === 0) return;
        erase(drawn);
        cleanup();
        resolve([...chosen]);
        return;
      } else if (str === "q" || key.name === "escape") {
        erase(drawn);
        cleanup();
        process.stdout.write("\n");
        process.exit(0);
      } else return;
      process.stdout.write(`\x1b[${drawn}A`);
      render();
    });
    render();
  });
}
