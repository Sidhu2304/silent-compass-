/*
 * Silent Compass - Firmware
 * Board: ESP32 Dev Module
 * 
 * Description:
 * Creates a BLE Server that listens for navigation commands ('L', 'R', 'S').
 * Controls 2 vibration motors connected to GPIO pins.
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// --- CONFIGURATION ---
// GPIO Pins for Motors
const int PIN_MOTOR_LEFT = 26;
const int PIN_MOTOR_RIGHT = 27;

// UUIDs (Must match the App.js)
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"
// ---------------------

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// Motor Control Helper
void stopMotors() {
  digitalWrite(PIN_MOTOR_LEFT, LOW);
  digitalWrite(PIN_MOTOR_RIGHT, LOW);
  Serial.println("Motors Stopped");
}

void vibrateLeft() {
  stopMotors();
  digitalWrite(PIN_MOTOR_LEFT, HIGH);
  Serial.println("Vibrating LEFT");
  // Auto-stop after 500ms safety (optional, but good for simple feedback)
  delay(500); 
  stopMotors();
}

void vibrateRight() {
  stopMotors();
  digitalWrite(PIN_MOTOR_RIGHT, HIGH);
  Serial.println("Vibrating RIGHT");
  delay(500);
  stopMotors();
}

// BLE Callback Class
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("Device Connected");
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("Device Disconnected");
    }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      std::string value = pCharacteristic->getValue();

      if (value.length() > 0) {
        char cmd = value[0]; // Get first character
        Serial.print("Received Command: ");
        Serial.println(cmd);

        if (cmd == 'L') {
          vibrateLeft();
        } else if (cmd == 'R') {
           vibrateRight();
        } else if (cmd == 'S') {
           stopMotors();
        }
      }
    }
};

void setup() {
  Serial.begin(115200);
  Serial.println("Starting Silent Compass Firmware...");

  // Setup Motor Pins
  pinMode(PIN_MOTOR_LEFT, OUTPUT);
  pinMode(PIN_MOTOR_RIGHT, OUTPUT);
  stopMotors();

  // Create the BLE Device
  BLEDevice::init("Silent Compass");

  // Create the BLE Server
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // Create the BLE Service
  BLEService *pService = pServer->createService(SERVICE_UUID);

  // Create the BLE Characteristic
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_WRITE  
                    );

  pCharacteristic->setCallbacks(new MyCallbacks());

  // Start the service
  pService->start();

  // Start advertising
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);  // functions that help with iPhone connections issues
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.println("Waiting for a client connection to notify...");
}

void loop() {
  // Connection management
  if (!deviceConnected && oldDeviceConnected) {
      delay(500); // give the bluetooth stack the chance to get things ready
      pServer->startAdvertising(); // restart advertising
      Serial.println("start advertising");
      oldDeviceConnected = deviceConnected;
  }
  // connecting
  if (deviceConnected && !oldDeviceConnected) {
      // do stuff here on connecting
      oldDeviceConnected = deviceConnected;
  }
  delay(10);
}
