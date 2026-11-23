export function createRecording() { return { ticks: 0, commands: [], valid: true }; }

export function recordControls(recording, input) {
  const command = [recording.ticks++, input.pitch, input.roll, input.yaw, input.throttle, Number(input.drift)];
  if (!recording.valid) return;
  const previous = recording.commands.at(-1);
  if (!previous || command.slice(1).some((value, index) => value !== previous[index + 1])) {
    if (recording.commands.length >= 20000) recording.valid = false;
    else recording.commands.push(command);
  }
  if (recording.ticks > 120 * 1800) recording.valid = false;
}
