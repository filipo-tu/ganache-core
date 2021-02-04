/// <reference types="node" />
import {
  SerializableObject,
  SerializedObject,
  DeserializedObject,
  Definitions
} from "./serializable-object";
interface BeaconEntryConfig {
  properties: {
    round: {
      type: number;
      serializedType: number;
      serializedName: "Round";
    };
    data: {
      type: Buffer;
      serializedType: string;
      serializedName: "Data";
    };
  };
}
declare type C = BeaconEntryConfig;
declare class BeaconEntry
  extends SerializableObject<C>
  implements DeserializedObject<C> {
  get config(): Definitions<C>;
  constructor(
    options?: Partial<SerializedObject<C>> | Partial<DeserializedObject<C>>
  );
  round: number;
  data: Buffer;
}
declare type SerializedBeaconEntry = SerializedObject<C>;
export { BeaconEntry, SerializedBeaconEntry };
