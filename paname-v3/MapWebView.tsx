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

  window._tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{
    maxZoom:19, subdomains:'abcd'
  }).addTo(map);

  L.control.attribution({position:'bottomright',prefix:''})
    .addAttribution('<span style="opacity:.4;font-size:9px">© CartoDB · OpenStreetMap</span>')
    .addTo(map);

  var userMarker = null;
  var stationMarkers = [];
  var activeMarkerId = null;
  var transportLines = [];
  var transportStops = [];

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
    stationMarkers.forEach(function(m){map.removeLayer(m);});
    stationMarkers=[];
  }

  function pinIcon(){
    return L.divIcon({
      className:'',
      html:'<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:#FF6B35;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 3px 10px rgba(255,107,53,0.6)"></div>',
      iconSize:[26,26],iconAnchor:[10,22]
    });
  }

  function showStation(id,lat,lon){
    stationMarkers.forEach(function(m){map.removeLayer(m);});
    stationMarkers=[];
    activeMarkerId=id;
    var m=L.marker([lat,lon],{icon:pinIcon(),zIndexOffset:3000}).addTo(map);
    stationMarkers.push(m);
  }

  function flyToStation(lat,lon){
    var zoom=15;
    // Décale le centre vers le bas pour que la gare apparaisse dans le tiers supérieur,
    // visible au-dessus du panneau des horaires qui couvre le bas de l'écran.
    var offset=map.getSize().y*0.22;
    var shifted=map.unproject(map.project([lat,lon],zoom).add([0,offset]),zoom);
    map.flyTo(shifted,zoom,{animate:true,duration:0.9});
  }

  function setTransportData(data){
    transportLines.forEach(function(l){map.removeLayer(l);});
    transportStops.forEach(function(m){map.removeLayer(m);});
    transportLines=[];transportStops=[];
    var modeColors={RER:'#0064B0',METRO:'#6E6E6E',TRAM:'#6EC4E8',TRAIN:'#87CEEB',CABLE:'#82C341'};
    var modePrio={TRAM:1,CABLE:2,METRO:3,TRAIN:4,RER:5};
    var sortedLines=(data.lines||[]).slice().sort(function(a,b){return (modePrio[a.mode]||0)-(modePrio[b.mode]||0);});
    sortedLines.forEach(function(l){
      if(!l.coords||!l.coords.length)return;
      var color='#'+(l.color||'888888');
      var weight=(l.mode==='RER'||l.mode==='TRAIN')?2.5:2;
      l.coords.forEach(function(seg){
        if(seg&&seg.length>=2){
          transportLines.push(L.polyline(seg,{color:color,weight:weight,opacity:0.8}).addTo(map));
        }
      });
    });
    (data.stops||[]).forEach(function(s){
      if(s.lat==null||s.lon==null)return;
      var color=modeColors[s.mode]||'#888888';
      var icon=L.divIcon({className:'',html:'<div style="width:8px;height:8px;border-radius:50%;background:'+color+';border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',iconSize:[8,8],iconAnchor:[4,4]});
      transportStops.push(L.marker([s.lat,s.lon],{icon:icon,zIndexOffset:500}).addTo(map));
    });
  }

  function setTheme(isDark){
    var url = isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    if(window._tileLayer){ map.removeLayer(window._tileLayer); }
    window._tileLayer = L.tileLayer(url,{maxZoom:19,subdomains:'abcd'}).addTo(map);
    document.body.style.background = isDark ? '#031a3a' : '#eef2f7';
    var s = document.getElementById('_gp_dots');
    if(!s){ s=document.createElement('style'); s.id='_gp_dots'; document.head.appendChild(s); }
    s.textContent = isDark
      ? 'img.leaflet-tile{filter:sepia(0.9) hue-rotate(180deg) saturate(2.5) brightness(2.2)!important}'
        + '.s-dot{background:#5ab3f5!important;border-color:rgba(1,14,38,0.8)!important;box-shadow:0 1px 6px rgba(90,179,245,0.4)!important}'
        + '.s-dot.active{background:#fff!important}'
      : '';
  }

  function handleMsg(e){
    try{
      var msg=JSON.parse(e.data);
      if(msg.type==='setLocation') setUserLocation(msg.lat,msg.lon);
      if(msg.type==='setStations') setStations(msg.stations);
      if(msg.type==='clearActive') clearActiveStation();
      if(msg.type==='setTheme') setTheme(msg.isDark);
      if(msg.type==='flyTo') flyToStation(msg.lat,msg.lon);
      if(msg.type==='showStation') showStation(msg.id,msg.lat,msg.lon);
      if(msg.type==='setTransportData') setTransportData(msg.data);
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
  setTheme: (isDark: boolean) => void;
  flyTo: (lat: number, lon: number) => void;
  showStation: (id: string, lat: number, lon: number) => void;
  setTransportData: (data: { stops: any[]; lines: any[] }) => void;
};

type Props = {
  onStationSelected?: (id: string, label: string) => void;
  onReady?: () => void;
};

const MapWebView = forwardRef<MapWebViewRef, Props>(({ onStationSelected, onReady }, ref) => {
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
    setTheme: (isDark) => {
      wvRef.current?.injectJavaScript(`setTheme(${isDark});true;`);
    },
    flyTo: (lat, lon) => {
      wvRef.current?.injectJavaScript(`flyToStation(${lat},${lon});true;`);
    },
    showStation: (id, lat, lon) => {
      wvRef.current?.injectJavaScript(`showStation(${JSON.stringify(id)},${lat},${lon});true;`);
    },
    setTransportData: (data) => {
      wvRef.current?.injectJavaScript(`setTransportData(${JSON.stringify(data)});true;`);
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
        onLoadEnd={onReady}
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
