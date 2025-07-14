/*
  An Arduino Sketch for reading data from a PZEM-014 or PZEM-016, tested with ESP32 DEVKit 1, Arduino 1.8.5
  EvertDekker.com 2018, based on the example from http://solar4living.com/pzem-arduino-modbus.htm

  If you want to use slaveid function to change the slaveid on the fly, you need to modify the ModbusMaster library (Or get the copy from my website)
  In ModbusMaster.h add at line 78
    void slaveid(uint8_t);
  In ModbusMaster.cpp add at line 75
    void ModbusMaster::slaveid(uint8_t slave)
     {
      _u8MBSlave = slave;
     }
*/
/* If you are using other then uart0 on the ESP32, Comment out in esp32-hal-uart.c the follwing line:
  //uart->dev->conf0.txfifo_rst = 1;
  //uart->dev->conf0.txfifo_rst = 0;
  //uart->dev->conf0.rxfifo_rst = 1;
  //uart->dev->conf0.rxfifo_rst = 0;
  Source: https://github.com/4-20ma/ModbusMaster/issues/93
*/
#include <WiFi.h>
#include <PubSubClient.h>
#include <time.h>
#include <SoftwareSerial.h>
#include <ModbusMaster.h>
#include <ArduinoJson.h>
//HardwareSerial Pzemserial(2);

#define RXD2 3 //Gpio pins Serial2
#define TXD2 4

#define MAX485_DE      5  // We're using a MAX485-compatible RS485 Transceiver. The Data Enable and Receiver Enable pins are hooked up as follows:
#define MAX485_RE_NEG  6
const char* ssid = "intania501_2.4G";
const char* password = "0818404328";

// MQTT Broker
const char* mqtt_server = "broker.netpie.io";
const int   mqtt_port   = 1883; 
const char* mqtt_client = "b58c4072-8091-4d7e-ad9d-2d40eedeeb5a"; // Replace with your MQTT client ID
const char* mqtt_user   = "3vtGCzBHyQWkyjuaj2Uqdbz9L7TEbjmY"; // Replace with your MQTT username
const char* mqtt_pass   = "Gzx367ABWzfvHwhfpfiAqu6PRJcsRHH9"; // Replace with your MQTT password
// MQTT Topic
const char* mqtt_topic  = "@msg/sensor"; 
const char* mqtt_topic_cmd   = "@msg/commands";
// SenserID
//const int sensor_id = 1;
// Initial relative humidity value

// MQTT Client
WiFiClient espClient;
PubSubClient client(espClient);

// Time (NTP) - Bangkok Timezone (UTC+7)
const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 7 * 3600;
const int daylightOffset_sec = 0;

String getTimeString() {
  unsigned long currentTime = millis();
  return String(currentTime);
}
void setup_wifi() {
  /*
  This function connects the ESP32 to the specified WiFi network.
  It prints the connection status to the Serial Monitor.
  It will block until the connection is established.
  If the connection fails, it will retry every 500 milliseconds.
  The SSID and password are defined at the top of the file.
  */
  delay(10);
  Serial.println();
  Serial.printf("Connecting to %s\n", ssid);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected.");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

// Function prototype for resetEnergy
void resetEnergy(uint8_t slaveAddr);

void mqtt_callback(char* topic, byte* payload, unsigned int length) {
  // Convert payload to string
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  // Parse JSON - using new JsonDocument instead of DynamicJsonDocument
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    Serial.print("JSON parsing failed: ");
    Serial.println(error.c_str());
    return;
  }
  
  // Your existing logic here...
  int sensor_id = doc["sensor_id"];
  
  if (doc["command"] == "reset_energy") {
    resetEnergy((uint8_t)sensor_id); // Now this function exists
    
    // Send confirmation
    String response = "{\"sensor_id\":" + 
                     String(sensor_id) + ",\"timestamp\":\"" + 
                     getTimeString() + "\"}"; // Now this function exists
    
    client.publish("energy/response", response.c_str());
  }
}

void reconnect_mqtt() {
  /*
  This function attempts to connect to the MQTT broker.
  It will block until the connection is established.
  If the connection fails, it will retry every 5 seconds.
  The MQTT server, port, client ID, username, and password are defined at the top of the file.
  */

  // Loop until connected
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    // Attempt to connect
    
    if (client.connect(mqtt_client, mqtt_user, mqtt_pass)) {
      // Successfully connected to the MQTT broker
      Serial.println("connected");

      client.subscribe(mqtt_topic_cmd);
      Serial.println("Subscribed to command topic");

    } else {
      // Failed to connect to the MQTT broker
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" trying again in 5 seconds");
      delay(5000);
    }
  }
}

void setup_time() {
  /*
  This function sets up the NTP client to synchronize the time.
  It uses the NTP server defined at the top of the file.
  It sets the timezone to UTC+7 (Bangkok time).
  It will block until the time is synchronized.
  The GMT offset and daylight offset are defined at the top of the file.
  */

  Serial.println("Setting up NTP time synchronization...");
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  Serial.print("Waiting for NTP time sync...");
  time_t now = time(nullptr);
  while (now < 8 * 3600 * 2) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
  }
  Serial.println("\nTime synced.");

  struct tm timeinfo;
  gmtime_r(&now, &timeinfo);
  Serial.printf("Current time (UTC+7): %s", asctime(&timeinfo));
}
SoftwareSerial Pzemserial(RXD2, TXD2); 

ModbusMaster node;
static uint8_t pzemSlaveAddr = 0x01;
void preTransmission()  // Put RS485 Transceiver in transmit mode
{
  digitalWrite(MAX485_RE_NEG, 1);
  digitalWrite(MAX485_DE, 1);
  delay(1);
}

void postTransmission()  // Put RS485 Transceiver back in receive mode (default mode)
{
  delay(3);
  digitalWrite(MAX485_RE_NEG, 0);
  digitalWrite(MAX485_DE, 0);
}

void resetEnergy(uint8_t slaveAddr)    //Reset the slave's energy counter
{
  uint16_t u16CRC = 0xFFFF;
  static uint8_t resetCommand = 0x42;
  u16CRC = crc16_update(u16CRC, slaveAddr);
  u16CRC = crc16_update(u16CRC, resetCommand);
  Serial.println("Resetting Energy");
  preTransmission();
  Serial.println("Resetting energy for sensor: " + String(slaveAddr));
  Pzemserial.write(slaveAddr);
  Pzemserial.write(resetCommand);
  Pzemserial.write(lowByte(u16CRC));
  Pzemserial.write(highByte(u16CRC));
  delay(10);
  postTransmission();
  delay(100);
  while (Pzemserial.available()) {         // Prints the response from the Pzem, do something with it if you like
    Serial.print(char(Pzemserial.read()), HEX);
    Serial.print(" ");
  }
}

void changeAddress(uint8_t OldslaveAddr, uint8_t NewslaveAddr)  //Change the slave address of a node
{
  static uint8_t SlaveParameter = 0x06;
  static uint16_t registerAddress = 0x0002; // Register address to be changed
  uint16_t u16CRC = 0xFFFF;
  u16CRC = crc16_update(u16CRC, OldslaveAddr);  // Calculate the crc16 over the 6bytes to be send
  u16CRC = crc16_update(u16CRC, SlaveParameter);
  u16CRC = crc16_update(u16CRC, highByte(registerAddress));
  u16CRC = crc16_update(u16CRC, lowByte(registerAddress));
  u16CRC = crc16_update(u16CRC, highByte(NewslaveAddr));
  u16CRC = crc16_update(u16CRC, lowByte(NewslaveAddr));

  Serial.println("Change Slave Address");
  preTransmission();
  Pzemserial.write(OldslaveAddr);
  Pzemserial.write(SlaveParameter);
  Pzemserial.write(highByte(registerAddress));
  Pzemserial.write(lowByte(registerAddress));
  Pzemserial.write(highByte(NewslaveAddr));
  Pzemserial.write(lowByte(NewslaveAddr));
  Pzemserial.write(lowByte(u16CRC));
  Pzemserial.write(highByte(u16CRC));
  delay(10);
  postTransmission();
  delay(100);
  while (Pzemserial.available()) {   // Prints the response from the Pzem, do something with it if you like
    Serial.print(char(Pzemserial.read()), HEX);
    Serial.print(" ");
  }
}

void setup() {
  Pzemserial.begin(9600);  // Note the format for setting a serial port is as follows: Serial2.begin(baud-rate, protocol, RX pin, TX pin);
  Serial.begin(9600);
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(mqtt_callback); 
  reconnect_mqtt();
  setup_time();
  node.begin(pzemSlaveAddr, Pzemserial);  //Start the Modbusmaster

  pinMode(MAX485_RE_NEG, OUTPUT);  // Setting up the RS485 transceivers
  pinMode(MAX485_DE, OUTPUT);
  digitalWrite(MAX485_RE_NEG, 0);  // Init in receive mode
  digitalWrite(MAX485_DE, 0);

  node.preTransmission(preTransmission);  // Callbacks allow us to configure the RS485 transceiver correctly
  node.postTransmission(postTransmission);

  //changeAddress(0x01, 0x02);
  /* By Uncomment the function in the above line you can change the slave address from one of the nodes, only need to be done ones. Preverable do this only with 1 slave in the network.
     changeAddress(OldAddress, Newaddress)
     If you f*ck it up or don't know the new address anymore, you can use the broadcast address 0XF8 as OldAddress to change the slave address. Use this with one slave ONLY in the network.
  */

  //resetEnergy(0x01);
  /* By Uncomment the function in the above line you can reset the energy counter (Wh) back to zero from one of the slaves.
  */

  delay(1000);
}

/*
  RegAddr Description                 Resolution
  0x0000  Voltage value               1LSB correspond to 0.1V
  0x0001  Current value low 16 bits   1LSB correspond to 0.001A
  0x0002  Current value high 16 bits
  0x0003  Power value low 16 bits     1LSB correspond to 0.1W
  0x0004  Power value high 16 bits
  0x0005  Energy value low 16 bits    1LSB correspond to 1Wh
  0x0006  Energy value high 16 bits
  0x0007  Frequency value             1LSB correspond to 0.1Hz
  0x0008  Power factor value          1LSB correspond to 0.01
  0x0009  Alarm status  0xFFFF is alarm，0x0000is not alarm
*/

  void loop() {
    uint8_t result;

    // ประกาศตัวแปรการวัดทั้งหมดในขอบเขตที่กว้างขึ้น
    float voltage = 0.0;
    float current = 0.0;
    float power = 0.0;
    float energy = 0.0;
    float hz = 0.0;
    float pf = 0.0;

    // ตัวแปร static สำหรับการนับค่า 0 ต่อเนื่อง
    static int zero_streak = 0;

    uint32_t tempdouble = 0x00000000;

    for (pzemSlaveAddr = 1; pzemSlaveAddr < 2; pzemSlaveAddr++) { // วนลูป PZEM เซ็นเซอร์ทั้งหมด
      Serial.print("Pzem Slave ");
      Serial.print(pzemSlaveAddr);
      Serial.print(": ");

      result = node.readInputRegisters(0x0000, 9); // อ่าน 9 registers ของ PZEM-014 / 016
      if (result == node.ku8MBSuccess) {
        voltage = node.getResponseBuffer(0x0000) / 10.0;
        tempdouble = (node.getResponseBuffer(0x0002) << 16) + node.getResponseBuffer(0x0001);
        current = tempdouble / 1000.00;
        tempdouble = (node.getResponseBuffer(0x0004) << 16) + node.getResponseBuffer(0x0003);
        power = tempdouble / 10.0;
        tempdouble = (node.getResponseBuffer(0x0006) << 16) + node.getResponseBuffer(0x0005);
        energy = tempdouble;
        hz = node.getResponseBuffer(0x0007) / 10.0;
        pf = node.getResponseBuffer(0x0008) / 100.00;

        if (pzemSlaveAddr == 2) {
          //Serial.println();
        }
      } else {
        Serial.println("Failed to read modbus");
        voltage = 0.0;
        current = 0.0;
        power = 0.0;
        energy = 0.0;
        hz = 0.0;
        pf = 0.0;
      }
    } // สิ้นสุด for loop

    delay(1000);

    if (!client.connected()) {
      reconnect_mqtt();
    }
    client.loop();

    static unsigned long lastPublish = 0;

    // ตรวจสอบว่าถึงเวลา publish หรือยัง
    if (millis() - lastPublish > 1000) {
      
      // ตรวจสอบว่าค่าทั้งหมดเป็น 0 หรือไม่
      bool all_zero = (voltage == 0.0 && current == 0.0 && power == 0.0 && 
                       energy == 0.0 && hz == 0.0 && pf == 0.0);
      
      if (all_zero) {
        zero_streak++;
        if (zero_streak < 3) {
          Serial.print("[⚠] Skipped 0-set (");
          Serial.print(zero_streak);
          Serial.println("/3)");
          lastPublish = millis(); // อัปเดต lastPublish เพื่อไม่ให้ค้างในลูป
          return; // ข้ามการส่งข้อมูล
        } else if (zero_streak == 3) {
          Serial.println("[✔] 0 appeared 3 times in a row — now logging.");
          // จะส่งข้อมูลต่อไป
        }
        // หากค่า zero_streak > 3 ก็จะส่งข้อมูลปกติ
      } else {
        zero_streak = 0; // รีเซ็ตเมื่อมีค่าปกติ
      }

      // Get the current time
      time_t now = time(nullptr);
      struct tm timeinfo;
      localtime_r(&now, &timeinfo);

      // Format the time as a string
      char timeStr[64];
      strftime(timeStr, sizeof(timeStr), "%Y-%m-%d %H:%M:%S+07", &timeinfo);

      int sensor_id = 1;

      // Build JSON payload
      char payload[256];
      snprintf(payload, sizeof(payload),
              "{\"time\": \"%s\", \"sensor_id\": %d, \"voltage\": %.2f, \"current\": %.2f, \"power\": %.2f, \"energy\": %.2f, \"hz\": %.2f, \"pf\": %.2f}",
              timeStr, sensor_id, voltage, current, power, energy, hz, pf);

      // Print to Serial Monitor
      Serial.println("Publishing data to MQTT:");
      Serial.println(payload);

      // Publish the payload to the MQTT topic
      client.publish(mqtt_topic, payload);

      lastPublish = millis();
    }
}

