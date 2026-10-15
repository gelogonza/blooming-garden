// Physical -> Web controller firmware (Elegoo Uno R3)
// Protocol (one message per line, 115200 baud):
//   OUT  "READY"          once, after boot
//   OUT  "L:<0-1023>,B:<0|1>,D:<cm>"  sensor snapshot ~30x/sec (D:0 = nothing in range)
//   IN   "S:<0-180>"      servo angle
//   IN   "C:<r>,<g>,<b>"  LED color (0-255 each)

#include <Servo.h>
#include <Adafruit_NeoPixel.h>

const int LDR_PIN = A0, BTN_PIN = 2, SERVO_PIN = 9, LED_PIN = 6;
const int IR_PIN = A1;                 // Sharp GP2Y0A21 IR distance sensor (yellow wire)

Servo servo;
Adafruit_NeoPixel led(1, LED_PIN, NEO_GRB + NEO_KHZ800);

char inbox[32];
byte len = 0;
unsigned long lastSend = 0;

void setup() {
  Serial.begin(115200);
  pinMode(BTN_PIN, INPUT_PULLUP);      // pressed = LOW
  servo.attach(SERVO_PIN);
  servo.write(0);
  led.begin();
  led.setBrightness(80);
  led.show();

  // Self-test: flash red, green, blue on boot so the LED proves itself
  uint32_t colors[] = { led.Color(255, 0, 0), led.Color(0, 255, 0), led.Color(0, 0, 255) };
  for (byte i = 0; i < 3; i++) {
    led.setPixelColor(0, colors[i]);
    led.show();
    delay(300);
  }
  led.clear();
  led.show();

  Serial.println("READY");             // browser waits for this before sending
}

void loop() {
  // OUTGOING: sensor snapshot every 33 ms, no delay()
  if (millis() - lastSend >= 33) {
    lastSend = millis();
    int light = analogRead(LDR_PIN);
    bool pressed = digitalRead(BTN_PIN) == LOW;
    Serial.print("L:"); Serial.print(light);
    Serial.print(",B:"); Serial.print(pressed ? 1 : 0);
    Serial.print(",D:"); Serial.println(readCm());
  }

  // INCOMING: assemble a line byte by byte, act on '\n'
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      inbox[len] = '\0';
      handle(inbox);
      len = 0;
    } else if (len < sizeof(inbox) - 1) {
      inbox[len++] = c;
    }
  }
}

// Sharp GP2Y0A21: outputs an analog VOLTAGE that rises as things get closer
// (~3.1 V at 10 cm, ~0.4 V at 80 cm). The curve isn't linear, so we convert
// with the power-law fit from the datasheet graph. Averaging 5 reads tames noise.
// Valid range is 10-80 cm; closer than 10 cm the reading folds back (looks farther).
int readCm() {
  long sum = 0;
  for (byte i = 0; i < 5; i++) sum += analogRead(IR_PIN);
  float volts = (sum / 5.0) * 5.0 / 1023.0;
  if (volts < 0.4) return 0;               // nothing within ~80 cm
  int cm = 29.988 * pow(volts, -1.173);
  return constrain(cm, 10, 80);
}

void handle(const char* msg) {
  if (strncmp(msg, "S:", 2) == 0) {
    servo.write(constrain(atoi(msg + 2), 0, 180));
  } else if (strncmp(msg, "C:", 2) == 0) {
    int r, g, b;
    if (sscanf(msg + 2, "%d,%d,%d", &r, &g, &b) == 3) {
      led.setPixelColor(0, led.Color(constrain(r,0,255), constrain(g,0,255), constrain(b,0,255)));
      led.show();
    }
  }
}
