/*
  Field guide demo: 9 g micro servo (SG90-class)
  ----------------------------------------------
  What it does
    1. On boot: sweeps slowly 20 -> 160 -> 20 degrees so you can see the full usable range.
    2. Then waits for commands from the Serial Monitor (115200 baud, line ending "Newline"):
         a number 0-180   -> move to that angle        e.g.  90
         s                -> sweep again
         u<500-2500>      -> send a raw pulse width in microseconds   e.g.  u1500

  Wiring (see wiring diagram)
    Servo brown  (GND)    -> Uno GND
    Servo red    (V+)     -> Uno 5V     (datasheet: 4.8-6 V)
    Servo orange (signal) -> Uno D9     (PWM pulse)
    Optional: 470-1000 uF electrolytic capacitor across 5V/GND to absorb motor current spikes.

  How the servo talks
    PWM position control: the Uno sends one HIGH pulse every 20 ms (50 Hz).
    The WIDTH of that pulse is the angle:  ~1.0 ms = one end, 1.5 ms = centre, ~2.0 ms = other end
    (this part accepts roughly 0.5-2.4 ms for its full ~180 degrees).
    Inside, a potentiometer on the output shaft tells the servo's own controller where it is,
    and it drives the motor until the pot matches the pulse.
*/

#include <Servo.h>                 // built into the Arduino IDE

const int SERVO_PIN = 9;
const int SAFE_MIN = 20, SAFE_MAX = 160;   // stop short of the hard end-stops (see gotchas)

Servo servo;

void sweep() {
  for (int a = SAFE_MIN; a <= SAFE_MAX; a++) { servo.write(a); delay(12); }   // ~2 s across
  for (int a = SAFE_MAX; a >= SAFE_MIN; a--) { servo.write(a); delay(12); }
  servo.write(90);
  Serial.println(F("sweep done -> 90"));
}

void setup() {
  Serial.begin(115200);
  // attach(pin, minPulse, maxPulse): tell the library this servo's pulse range in microseconds
  servo.attach(SERVO_PIN, 500, 2400);
  servo.write(90);                          // start centred
  delay(500);
  Serial.println(F("micro servo demo: type 0-180, 's' to sweep, or u<micros>"));
  sweep();
}

void loop() {
  if (!Serial.available()) return;
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  if (cmd.length() == 0) return;

  if (cmd == "s") { sweep(); return; }

  if (cmd.charAt(0) == 'u') {               // raw pulse width, for exploring this servo's real limits
    int us = constrain(cmd.substring(1).toInt(), 500, 2500);
    servo.writeMicroseconds(us);
    Serial.print(F("pulse ")); Serial.print(us); Serial.println(F(" us"));
    return;
  }

  int angle = constrain(cmd.toInt(), 0, 180);
  if (angle < SAFE_MIN || angle > SAFE_MAX) Serial.println(F("(near the end-stop: listen for buzzing)"));
  servo.write(angle);
  Serial.print(F("angle ")); Serial.println(angle);
}
