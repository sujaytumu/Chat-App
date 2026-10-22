import MapThumb from "./MapThumb";

// A shared place inside a bubble: a map with a pin, and the place name underneath. Tap to open it in Maps.
const LocationCard = ({ location }) => (
  <a href={location.url} target="_blank" rel="noopener noreferrer" className="block w-[250px] max-w-full mb-1 rounded-lg overflow-hidden bg-black/10">
    <MapThumb lat={location.lat} lng={location.lng} height={140} marker="pin" />
    <p className="px-2.5 pt-2 pb-1 text-[13.5px] font-medium leading-snug break-words">{location.title || "Current location"}</p>
  </a>
);

export default LocationCard;
