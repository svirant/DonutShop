#include <Arduino.h>
#include "esp32-hal-tinyusb.h"

void setup(){
  usb_persist_restart(RESTART_BOOTLOADER);
}

void loop(){
}
