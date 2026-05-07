/*
 * AtomicTag — Lazer Test
 * Butona bas → lazer yanar + buzzer ses verir
 *
 * D1 (GPIO5)  → Tetik butonu (GND'ye bağlı)
 * D2 (GPIO4)  → Lazer LED
 * D5 (GPIO14) → Buzzer
 */

#define PIN_TRIGGER  5
#define PIN_LASER    4
#define PIN_BUZZER   14

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Lazer Test ===");

  pinMode(PIN_TRIGGER, INPUT_PULLUP);
  pinMode(PIN_LASER, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_LASER, LOW);

  Serial.println("Butona bas -> lazer yanar");
}

void loop() {
  if (digitalRead(PIN_TRIGGER) == LOW) {
    digitalWrite(PIN_LASER, HIGH);
    tone(PIN_BUZZER, 2000, 50);
    Serial.println("ATES!");
  } else {
    digitalWrite(PIN_LASER, LOW);
  }
}
