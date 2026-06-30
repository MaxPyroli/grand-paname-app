import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body,#map{height:100%;width:100%;background:#eef2f7}
    @keyframes pulse{
      0%{transform:scale(0.8);opacity:0.9}
      70%{transform:scale(2.8);opacity:0}
      100%{transform:scale(0.8);opacity:0}
    }
    .u-ring{
      position:absolute;width:32px;height:32px;top:-8px;left:-8px;
      background:rgba(52,152,219,0.28);border-radius:50%;
      animation:pulse 2.2s ease-out infinite;pointer-events:none;
    }
    .u-dot{
      width:16px;height:16px;position:relative;z-index:1;
      background:#3498db;border:3px solid #fff;border-radius:50%;
      box-shadow:0 2px 10px rgba(52,152,219,0.65);
    }
    .s-dot{
      width:11px;height:11px;
      background:#25303b;border:2.5px solid #fff;border-radius:50%;
      box-shadow:0 1px 5px rgba(0,0,0,0.35);cursor:pointer;
      transition:transform .15s;
    }
    .s-dot:hover{transform:scale(1.4)}
    .s-dot.active{background:#3498db}
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map',{zoomControl:false,attributionControl:false}).setView([48.8566,2.3522],13);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{
    maxZoom:19, subdomains:'abcd'
  }).addTo(map);

  // Attribution discrète en bas à droite
  L.control.attribution({position:'bottomright',prefix:''})
    .addAttribution('<span style="opacity:.4;font-size:9px">© CartoDB · OpenStreetMap</span>')
    .addTo(map);

  var userMarker = null;
  var stationMarkers = [];
  var activeMarkerId = null;

  function userIcon(){
    return L.divIcon({
      className:'',
      html:'<div class="u-ring"></div><div class="u-dot"></div>',
      iconSize:[16,16], iconAnchor:[8,8]
    });
  }

  function stationIcon(active){
    return L.divIcon({
      className:'',
      html:'<div class="s-dot'+(active?' active':'')+'"></div>',
      iconSize:[11,11], iconAnchor:[5.5,5.5]
    });
  }

  function setUserLocation(lat,lon){
    var ll=[lat,lon];
    if(!userMarker){
      userMarker=L.marker(ll,{icon:userIcon(),zIndexOffset:2000}).addTo(map);
    } else {
      userMarker.setLatLng(ll);
    }
    map.flyTo(ll,15,{animate:true,duration:0.9});
  }

  function setStations(stations){
    stationMarkers.forEach(function(m){map.removeLayer(m);});
    stationMarkers=[];
    stations.forEach(function(s){
      if(s.lat==null||s.lon==null) return;
      var active=(s.id===activeMarkerId);
      var m=L.marker([s.lat,s.lon],{icon:stationIcon(active),zIndexOffset:1000})
        .addTo(map)
        .on('click',function(){
          activeMarkerId=s.id;
          stationMarkers.forEach(function(mk,i){
            mk.setIcon(stationIcon(stations[i]&&stations[i].id===s.id));
          });
          window.ReactNativeWebView.postMessage(
            JSON.stringify({type:'stationSelected',id:s.id,label:s.label})
          );
        });
      stationMarkers.push(m);
    });
  }

  function clearActiveStation(){
    activeMarkerId=null;
    stationMarkers.forEach(function(m){m.setIcon(stationIcon(false));});
  }

  function handleMsg(e){
    try{
      var msg=JSON.parse(e.data);
      if(msg.type==='setLocation') setUserLocation(msg.lat,msg.lon);
      if(msg.type==='setStations') setStations(msg.stations);
      if(msg.type==='clearActive') clearActiveStation();
    }catch(err){}
  }
  document.addEventListener('message',handleMsg);
  window.addEventListener('message',handleMsg);
</script>
</body>
</html>`;

export type MapWebViewRef = {
  setUserLocation: (lat: number, lon: number) => void;
  setStations: (stations: Array<{ id: string; label: string; lat?: number; lon?: number }>) => void;
  clearActiveStation: () => void;
};

type Props = {
  onStationSelected?: (id: string, label: string) => void;
};

const MapWebView = forwardRef<MapWebViewRef, Props>(({ onStationSelected }, ref) => {
  const wvRef = useRef<WebView>(null);

  useImperativeHandle(ref, () => ({
    setUserLocation: (lat, lon) => {
      wvRef.current?.injectJavaScript(`setUserLocation(${lat},${lon});true;`);
    },
    setStations: (stations) => {
      wvRef.current?.injectJavaScript(`setStations(${JSON.stringify(stations)});true;`);
    },
    clearActiveStation: () => {
      wvRef.current?.injectJavaScript(`clearActiveStation();true;`);
    },
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={wvRef}
        source={{ html: MAP_HTML }}
        style={StyleSheet.absoluteFill}
        scrollEnabled={false}
        bounces={false}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#3498db" />
          </View>
        )}
        onMessage={(e) => {
          try {
            const d = JSON.parse(e.nativeEvent.data);
            if (d.type === 'stationSelected') onStationSelected?.(d.id, d.label);
          } catch {}
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  loader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#eef2f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MapWebView;
