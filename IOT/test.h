#include <TFT_eSPI.h>

TFT_eSPI tft;

void setup() {
  Serial.begin(115200);

  tft.init();
  tft.setRotation(1);

  tft.fillScreen(TFT_BLACK);
  delay(1000);

  tft.fillScreen(TFT_RED);
  delay(1000);

  tft.fillScreen(TFT_GREEN);
  delay(1000);

  tft.fillScreen(TFT_BLUE);
  delay(1000);

  tft.fillScreen(TFT_BLACK);

  tft.setTextColor(TFT_WHITE);
  tft.setTextSize(3);
  tft.setCursor(20, 20);
  tft.println("ILI9341 OK");
}

void loop() {
}