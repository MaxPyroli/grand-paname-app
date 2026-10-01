P=fun.grandpaname.app.dev
adb shell dumpsys gfxinfo $P reset >/dev/null
for i in $(seq 1 12); do
  adb shell "input swipe 300 1300 800 900 250; input swipe 800 900 300 1300 250; input swipe 540 1500 540 800 250; input swipe 540 800 540 1500 250"
done
adb shell dumpsys gfxinfo $P | grep -E "Total frames|Janky frames:|50th percentile|90th percentile|95th percentile|99th percentile"
