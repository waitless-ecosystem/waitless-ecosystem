#include <TFT_eSPI.h>
#include <TouchScreen.h>

// --- TOUCH SCREEN PINS (D6/D7) ---
#define YP 33  // Tied to LCD CS
#define XM 15  // Tied to LCD RS (DC)
#define YM 14  // Tied to LCD D7
#define XP 27  // Tied to LCD D6

TouchScreen ts = TouchScreen(XP, YP, XM, YM, 300);
TFT_eSPI tft = TFT_eSPI();

void setup() {
  // 10-bit math fix
  analogReadResolution(10); 

  tft.init();
  tft.setRotation(1); 
  tft.fillScreen(TFT_BLACK);

  // We set text color to White, with a Black background. 
  // This automatically erases the old numbers so they don't overlap into a mess!
  tft.setTextColor(TFT_WHITE, TFT_BLACK); 
  tft.setTextSize(4);
}

void loop() {
  // 1. Read touch
  TSPoint p = ts.getPoint();

  // 2. Return control to LCD
  pinMode(YP, OUTPUT);
  pinMode(XM, OUTPUT);
  pinMode(YM, OUTPUT);
  pinMode(XP, OUTPUT);

  // 3. Print directly to the LCD!
  // We add spaces at the end of the print lines to erase trailing digits
  tft.setCursor(20, 40);
  tft.print("X: "); 
  tft.print(p.x); 
  tft.print("    "); 
  
  tft.setCursor(20, 110);
  tft.print("Y: "); 
  tft.print(p.y); 
  tft.print("    ");

  tft.setCursor(20, 180);
  tft.print("Z: "); 
  tft.print(p.z); 
  tft.print("    ");
  
  delay(100); 
}