import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { MODE_ICONS } from './modeIcons';

function getMapHTML(isDark: boolean) {
  const iconsJson = JSON.stringify(MODE_ICONS);
  const bg = isDark ? '#031a3a' : '#eef2f7';
  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body,#map{height:100%;width:100%;background:${bg}}
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
    .n-icon{
      width:24px;height:24px;border-radius:6px;
      box-shadow:0 2px 6px rgba(0,0,0,0.45);
      cursor:pointer;transition:transform .15s;
    }
    .n-icon:hover{transform:scale(1.2)}
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map',{zoomControl:false,attributionControl:false}).setView([48.8566,2.3522],13);

  window._tileLayer = L.tileLayer('${tileUrl}',{
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
  var nearbyStopMarkers = [];

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
      var weight=(l.mode==='RER'||l.mode==='TRAIN')?4:(l.mode==='METRO')?2.5:1.5;
      l.coords.forEach(function(seg){
        if(seg&&seg.length>=2){
          transportLines.push(L.polyline(seg,{color:color,weight:weight,opacity:1}).addTo(map));
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

  var NEARBY_ICONS=${iconsJson};
  var MODE_MIN_ZOOM={RER:13,TRAIN:13,METRO:14,TRAM:14,CABLE:14,BUS:15,FLUVIAL:15,AUTRE:15};
  var MODE_ICON_SIZE={RER:24,TRAIN:24,METRO:20,TRAM:18,CABLE:18,BUS:14,FLUVIAL:16,AUTRE:14};
  var _allNearbyStops=[];

  function _minZoomForStop(s){
    var min=99;
    (s.modes||[]).forEach(function(m){ var z=MODE_MIN_ZOOM[m]||15; if(z<min)min=z; });
    return min;
  }

  function _renderNearbyStops(){
    nearbyStopMarkers.forEach(function(m){map.removeLayer(m);});
    nearbyStopMarkers=[];
    var z=map.getZoom();
    _allNearbyStops.forEach(function(s){
      if(s.lat==null||s.lon==null)return;
      if(_minZoomForStop(s)>z)return;
      var visibleModes=(s.modes||[]).filter(function(m){ return (MODE_MIN_ZOOM[m]||15)<=z; });
      if(!visibleModes.length)return;
      var maxSz=0;
      visibleModes.forEach(function(m){ var s2=MODE_ICON_SIZE[m]||14; if(s2>maxSz)maxSz=s2; });
      var sz=visibleModes.length>1?Math.max(maxSz-2,12):maxSz;
      var gap=3;
      var totalW=visibleModes.length*sz+(visibleModes.length-1)*gap;
      var imgs=visibleModes.map(function(m){
        var src=NEARBY_ICONS[m]||NEARBY_ICONS['BUS'];
        return '<img class="n-icon" src="'+src+'" style="width:'+sz+'px;height:'+sz+'px"/>';
      }).join('');
      var html='<div style="display:flex;gap:'+gap+'px;align-items:center">'+imgs+'</div>';
      var icon=L.divIcon({className:'',html:html,iconSize:[totalW,sz],iconAnchor:[totalW/2,sz/2]});
      var m=L.marker([s.lat,s.lon],{icon:icon,zIndexOffset:800})
        .addTo(map)
        .on('click',function(){
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'stationSelected',id:s.id,label:s.label}));
        });
      nearbyStopMarkers.push(m);
    });
  }

  function setNearbyStops(stops){
    _allNearbyStops=stops;
    _renderNearbyStops();
  }

  map.on('zoomend',function(){ _renderNearbyStops(); });

  var _vpTimer=null;
  map.on('moveend zoomend',function(){
    clearTimeout(_vpTimer);
    _vpTimer=setTimeout(function(){
      var c=map.getCenter();
      var z2=map.getZoom();
           var maxR=z2<=13?15000:z2<=14?8000:5000;
           var radius=Math.min(Math.round(c.distanceTo(map.getBounds().getNorthEast())),maxR);
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'viewportChanged',lat:c.lat,lon:c.lng,zoom:map.getZoom(),radius:radius}));
    },600);
  });

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
      if(msg.type==='setNearbyStops') setNearbyStops(msg.stops);
    }catch(err){}
  }
  document.addEventListener('message',handleMsg);
  window.addEventListener('message',handleMsg);
</script>
</body>
</html>`;}

export type NearbyStopMarker = { id: string; label: string; lat: number; lon: number; modes: string[] };

export type MapWebViewRef = {
  setUserLocation: (lat: number, lon: number) => void;
  setStations: (stations: Array<{ id: string; label: string; lat?: number; lon?: number }>) => void;
  clearActiveStation: () => void;
  setTheme: (isDark: boolean) => void;
  flyTo: (lat: number, lon: number) => void;
  showStation: (id: string, lat: number, lon: number) => void;
  setTransportData: (data: { stops: any[]; lines: any[] }) => void;
  setNearbyStops: (stops: NearbyStopMarker[]) => void;
};

type Props = {
  onStationSelected?: (id: string, label: string) => void;
  onViewportChanged?: (lat: number, lon: number, zoom: number, radius: number) => void;
  onReady?: () => void;
  isDark?: boolean;
};

const MapWebView = forwardRef<MapWebViewRef, Props>(({ onStationSelected, onViewportChanged, onReady, isDark }, ref) => {
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
    setNearbyStops: (stops) => {
      wvRef.current?.injectJavaScript(`setNearbyStops(${JSON.stringify(stops)});true;`);
    },
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={wvRef}
        source={{ html: getMapHTML(isDark ?? false) }}
        style={StyleSheet.absoluteFill}
        scrollEnabled={false}
        bounces={false}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        startInLoadingState={true}
        onLoadEnd={onReady}
        renderLoading={() => (
          <View style={[styles.loader, { backgroundColor: isDark ? '#031a3a' : '#eef2f7' }]}>
            <ActivityIndicator size="large" color="#3498db" />
          </View>
        )}
        onMessage={(e) => {
          try {
            const d = JSON.parse(e.nativeEvent.data);
            if (d.type === 'stationSelected') onStationSelected?.(d.id, d.label);
            if (d.type === 'viewportChanged') onViewportChanged?.(d.lat, d.lon, d.zoom, d.radius ?? 1000);
          } catch {}
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MapWebView;
