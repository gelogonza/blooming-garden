/*
  Field guide demo: Sharp GP2Y0D02YK0F infrared proximity sensor (digital, ~80 cm trigger)
  ----------------------------------------------------------------------------------------
  What it does
    Reports whether something is within ~80 cm. Prints DETECTED / clear on every change (with how
    long the previous state lasted), shows the live output voltage, and mirrors the state on the
    Uno's built-in LED (pin 13).

  Wiring (see wiring diagram)
    Sensor Vcc (pin 3, red)    -> Uno 5V     (datasheet: 4.5-5.5 V)
    Sensor GND (pin 2, black)  -> Uno GND
    Sensor Vo  (pin 1, yellow) -> Uno A1
    10 uF electrolytic capacitor across 5V and GND near the sensor (+ leg to 5V)

  Open Tools > Serial Monitor at 115200 baud. Keep the sensor pointed at open space for the first
  second while it calibrates, then move your hand toward it.

  How the sensor talks
    It is a DIGITAL (one-bit) sensor: Vo should go HIGH (>= Vcc - 0.3 V) when something is within
    ~80 cm and LOW (<= 0.6 V) otherwise. MY unit's HIGH only reaches about 0.3 V at the Uno, which
    is far below the ~2.5 V digitalRead() needs to see a HIGH. So instead of digitalRead(), this
    sketch reads the voltage with analogRead() and compares it to a threshold measured at boot.
    That works whether your sensor swings the full 5 V or, like mine, only a few tenths of a volt.
*/

const int IR_PIN  = A1;    // sensor's Vo
const int LED_PIN = 13;    // Uno's on-board LED

float baseline = 0;        // Vo with nothing in front (measured in setup)
float threshold = 0.10;    // volts above baseline that count as "detected"

bool lastState = false;
unsigned long lastChange = 0, lastPrint = 0;

float readVolts() {        // average 4 readings to smooth out the LED's current bursts
  long sum = 0;
  for (int i = 0; i < 4; i++) { sum += analogRead(IR_PIN); delay(2); }
  return (sum / 4) * (5.0 / 1023.0);
}

// Require the same answer 3 times in a row (~120 ms) before believing a change,
// so a hand right at the ~80 cm edge doesn't chatter.
bool readStable(float v) {
  static bool stable = false;
  static int agree = 0;
  bool now = v > baseline + threshold;
  if (now != stable) { if (++agree >= 3) { stable = now; agree = 0; } }
  else agree = 0;
  return stable;
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  delay(60);                               // datasheet: ~47 ms start-up before the first valid output

  // calibrate: average 1 s of readings with nothing in front of the sensor
  float sum = 0;
  for (int i = 0; i < 25; i++) { sum += readVolts(); delay(30); }
  baseline = sum / 25;
  Serial.print(F("GP2Y0D02YK0F demo. baseline Vo = ")); Serial.print(baseline, 2);
  Serial.print(F(" V, trigger above ")); Serial.print(baseline + threshold, 2); Serial.println(F(" V"));
}

void loop() {
  float v = readVolts();
  bool near = readStable(v);
  digitalWrite(LED_PIN, near ? HIGH : LOW);

  if (near != lastState) {                 // print only when the state flips
    unsigned long now = millis();
    Serial.print(near ? F(">> DETECTED   ") : F("-- clear      "));
    Serial.print(F("(previous state lasted ")); Serial.print((now - lastChange) / 1000.0, 2); Serial.println(F(" s)"));
    lastState = near; lastChange = now;
  }
  if (millis() - lastPrint > 1000) {       // once a second, show the raw voltage
    lastPrint = millis();
    Serial.print(F("   Vo = ")); Serial.print(v, 2); Serial.println(F(" V"));
  }
  delay(40);                               // ~ one sensor update period (~38 ms)
}
