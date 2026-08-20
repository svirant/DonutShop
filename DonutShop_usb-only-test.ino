#include <EspUsbHostSerial_FTDI.h>// https://github.com/wakwak-koba/EspUsbHost in order to have FTDI support for the RT4K usb serial port, this is the easist method.
                                  // Step 1 - Goto the github link above. Click the GREEN "<> Code" box and "Download ZIP"
                                  // Step 2 - In Arudino IDE; goto "Sketch" -> "Include Library" -> "Add .ZIP Library"

class SerialFTDI : public EspUsbHostSerial_FTDI {
  virtual void onNew() override {
    submit((uint8_t *)"remote prof8\r", 13); // make sure to keep the \r at the end if changing the command
  }
};

SerialFTDI usbDev;

void setup() {
  usbDev.begin(115200);
}

void loop()
{
  usbDev.task();
}
