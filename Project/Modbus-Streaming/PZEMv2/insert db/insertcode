import json
import psycopg2
import paho.mqtt.client as mqtt

# PostgreSQL Connection
CONNECTION = "postgres://postgres:password@localhost:30000/postgres"
insert_query = """
INSERT INTO sensor_data (time, sensor_id, voltage, current, power, energy, hz, pf)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
"""

# MQTT Settings (Netpie)

# MQTT Settings (Netpie)
MQTT_BROKER = "broker.netpie.io"
MQTT_PORT = 1883
MQTT_TOPIC = "@msg/sensor"
MQTT_CLIENT = "d97def3d-de68-4c6e-83cd-394d2ebc1a18"
MQTT_USER = "11Mn1dSEx2Ujjn9TM24732PGfBEHkgic"
MQTT_PASS = "ZCdhpq9TUq3mre6bYKBSVDZqLKAcnxUf"
zero_counter = 0  # นับจำนวนครั้งที่ค่าทั้งหมดเป็นศูนย์
# MQTT Callback
def on_connect(client, userdata, flags, rc, properties=None):
    print("Connected with result code " + str(rc))
    client.subscribe(MQTT_TOPIC)

def on_message(client, userdata, msg):
    global zero_streak
    try:
        payload = json.loads(msg.payload.decode())
        print(f"[📨] Received: {payload}")

        values = [
            payload["voltage"],
            payload["current"],
            payload["power"],
            payload["energy"],
            payload["hz"],
            payload["pf"]
        ]

        if all(v == 0 for v in values):
            zero_streak += 1
            if zero_streak < 3:
                print(f"[⚠] Skipped 0-set ({zero_streak}/3)")
                return
            elif zero_streak == 3:
                print("[✔] 0 appeared 3 times in a row — now logging.")
        else:
            zero_streak = 0  # reset streak เมื่อมีค่าปกติ

        data = (
            payload["time"],
            payload["sensor_id"],
            *values
        )

        with psycopg2.connect(CONNECTION) as conn:
            with conn.cursor() as cur:
                cur.execute(insert_query, data)
            conn.commit()
        print("[✔] Inserted to PostgreSQL")

    except Exception as e:
        print(f"[✘] Error: {e}")

# Setup MQTT Client (for v2.1.0)
client = mqtt.Client(client_id=MQTT_CLIENT, protocol=mqtt.MQTTv311)
client.username_pw_set(MQTT_USER, MQTT_PASS)
client.on_connect = on_connect
client.on_message = on_message

client.connect(MQTT_BROKER, MQTT_PORT)
client.loop_forever()