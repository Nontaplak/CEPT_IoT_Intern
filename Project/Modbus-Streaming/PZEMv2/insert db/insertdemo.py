import json
import random
import time
import psycopg2
import paho.mqtt.client as mqtt
from datetime import datetime

# PostgreSQL Connection
CONNECTION = "postgres://postgres:password@localhost:30000/postgres"
insert_query = """
INSERT INTO sensor_data (time, sensor_id, voltage, current, power, energy, hz, pf)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
"""

# MQTT Settings (Netpie)
MQTT_BROKER = "broker.netpie.io"
MQTT_PORT = 1883
MQTT_TOPIC = "@msg/sensor"
MQTT_CLIENT = "d97def3d-de68-4c6e-83cd-394d2ebc1a18"
MQTT_USER = "11Mn1dSEx2Ujjn9TM24732PGfBEHkgic"
MQTT_PASS = "ZCdhpq9TUq3mre6bYKBSVDZqLKAcnxUf"

# Random Data Generator
def generate_random_payload():
    return {
        "time": datetime.now().isoformat(),
        "sensor_id": 1,
        "voltage": round(random.uniform(210.0, 240.0), 2),
        "current": round(random.uniform(0.1, 5.0), 2),
        "power": round(random.uniform(10.0, 1000.0), 2),
        "energy": round(random.uniform(0.1, 100.0), 2),
        "hz": round(random.uniform(49.5, 60.5), 2),
        "pf": round(random.uniform(0.5, 1.0), 2)
    }

# MQTT Callback
def on_connect(client, userdata, flags, rc, properties=None):
    print("Connected with result code " + str(rc))

def publish_random_data(client):
    while True:
        payload = generate_random_payload()
        client.publish(MQTT_TOPIC, json.dumps(payload))
        print(f"[📤] Published: {payload}")

        # Insert into PostgreSQL
        try:
            data = (
                payload["time"],
                payload["sensor_id"],
                payload["voltage"],
                payload["current"],
                payload["power"],
                payload["energy"],
                payload["hz"],
                payload["pf"]
            )
            with psycopg2.connect(CONNECTION) as conn:
                with conn.cursor() as cur:
                    cur.execute(insert_query, data)
                conn.commit()
            print("[✔] Inserted to PostgreSQL")
        except Exception as e:
            print(f"[✘] Insert Error: {e}")

        time.sleep(5)  # สุ่มทุก 5 วินาที

# Setup MQTT Client
client = mqtt.Client(client_id=MQTT_CLIENT, protocol=mqtt.MQTTv311)
client.username_pw_set(MQTT_USER, MQTT_PASS)
client.on_connect = on_connect

client.connect(MQTT_BROKER, MQTT_PORT)
client.loop_start()

publish_random_data(client)
