//
// Sample mobile application for demonstrating the Upwind Cloud platform used with React Native/Expo.
// Adapted from the SQLite sample app in the Expo documentation, but using Upwind Cloud as the backend instead of SQLite storage.
// Can be freely adapted and distributed without resitrictions.
// For more information, visit https://www.upwindtec.pt
//
import { useState, useEffect, useCallback } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  UpwindCloudStorage,
  where,
} from "./upwindcloud";

/**
 * The Item type represents a single item in database.
 */
interface ItemEntity {
  Id: string;
  done: boolean;
  value: string;
}

//#region Components

/**
 * Root component that delegates all app behavior to `Main`.
 */
export default function App() {
  return <Main />;
}

/**
 * Main screen component for the app.
 *
 * Internal flow:
 * 1. Creates a storage client and local UI state.
 * 2. Defines `refetchItems` to read open/completed items from the backend.
 * 3. Calls `refetchItems` when the component mounts.
 * 4. Renders input + todo/completed lists.
 * 5. On user actions, performs backend mutation then refreshes state.
 */
function Main() {
  // Creates a storage instance used by all database operations in this component.
  // replace the URL below with the URL of your Upwind Cloud instance
  const db = new UpwindCloudStorage("http://cloudtest1.upwindtec.pt:7005");

  // `text` holds the current input value from the add-item text field.
  const [text, setText] = useState("");

  // `todoItems` and `doneItems` store split views of the same collection.
  const [todoItems, setTodoItems] = useState<ItemEntity[]>([]);
  const [doneItems, setDoneItems] = useState<ItemEntity[]>([]);

  /**
   * Refreshes both todo and completed lists from cloud storage.
   *
   * Internal flow:
   * 1. Builds a query for incomplete items and fetches documents.
   * 2. Maps query snapshots into `ItemEntity` objects and updates todo state.
   * 3. Builds a second query for completed items.
   * 4. Maps those results and updates completed state.
   * 5. Logs errors if any network/query step fails.
   */
  const refetchItems = useCallback(() => {
    // Nested async worker so the callback itself remains sync and callable from UI handlers.
    async function refetch() {
      try {
        // Query all items where done === false.
        let q = query(collection(db, "items"), where("done", "==", false));

        // Fetch and transform query results into strongly-typed view state.
        const snapshot = await getDocs(q);
        setTodoItems(
          snapshot.docs.map((doc) => ({
            ...(doc.data() as ItemEntity),
          })),
        );

        // Query all items where done === true.
        q = query(collection(db, "items"), where("done", "==", true));

        // Fetch and transform completed items for the second list.
        const snapshot2 = await getDocs(q);
        setDoneItems(
          snapshot2.docs.map((doc) => ({
            ...(doc.data() as ItemEntity),
          })),
        );
      } catch (error: any) {
        console.error("Error fetching items:", error);
      }
    }

    // Execute the async refresh sequence.
    refetch();
  }, [db]);

  // Runs once at mount time to populate the initial list state.
  useEffect(() => {
    refetchItems();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Upwind Cloud Example</Text>

      <View style={styles.flexRow}>
        <TextInput
          // Keeps local input state synchronized with every keystroke.
          onChangeText={(text) => setText(text)}
          onSubmitEditing={async () => {
            // Adds a new item to storage.
            await addItemAsync(db, text);

            // Re-queries to display the newly added item in the proper list.
            await refetchItems();

            // Clears the input after a successful submit path.
            setText("");
          }}
          placeholder="what do you need to do?"
          style={styles.input}
          value={text}
        />
      </View>

      <ScrollView style={styles.listArea}>
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeading}>Todo</Text>
          {todoItems.map((item) => (
            <Item
              key={item.Id}
              item={item}
              onPressItem={async (Id) => {
                // Marks item as done, then refreshes both lists.
                await updateItemAsDoneAsync(db, Id);
                await refetchItems();
              }}
            />
          ))}
        </View>
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeading}>Completed</Text>
          {doneItems.map((item) => (
            <Item
              key={item.Id}
              item={item}
              onPressItem={async (Id) => {
                // Deletes completed item, then refreshes both lists.
                await deleteItemAsync(db, Id);
                await refetchItems();
              }}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Presentation component for a single todo row.
 *
 * Internal flow:
 * 1. Destructures fields from the provided item.
 * 2. Applies conditional styles based on completion state.
 * 3. Invokes `onPressItem` with the item Id when tapped.
 */
function Item({
  item,
  onPressItem,
}: {
  item: ItemEntity;
  onPressItem: (Id: string) => void | Promise<void>;
}) {
  const { Id, done, value } = item;
  return (
    <TouchableOpacity
      onPress={() => onPressItem && onPressItem(Id)}
      style={[styles.item, done && styles.itemDone]}
    >
      <Text style={[styles.itemText, done && styles.itemTextDone]}>
        {value}
      </Text>
    </TouchableOpacity>
  );
}

//#endregion

//#region Database Operations

/**
 * Creates a new item document when the user submits non-empty text.
 *
 * Internal flow:
 * 1. Guards against empty input.
 * 2. Writes a new item object to the `items` collection.
 * 3. Leaves list refresh to the caller after write completion.
 */
async function addItemAsync(
  db: UpwindCloudStorage,
  text: string,
): Promise<void> {
  if (text !== "") {
    await addDoc(collection(db, "items"), {
      done: false,
      value: text,
    });
  }
}

/**
 * Marks an item as completed by updating its `done` field.
 *
 * Internal flow:
 * 1. Builds a document reference from collection + id.
 * 2. Sends an update payload setting `done: true`.
 * 3. Logs success after the write resolves.
 */
async function updateItemAsDoneAsync(
  db: UpwindCloudStorage,
  Id: string,
): Promise<void> {
  await setDoc(doc(db, "items", Id), {
    done: true,
  }).then(() => {
    console.log("Successfully updated task's done status to done.");
  });
}

/**
 * Deletes an item document from storage.
 *
 * Internal flow:
 * 1. Builds a document reference from collection + id.
 * 2. Sends a delete request for that document.
 * 3. Logs success after deletion completes.
 */
async function deleteItemAsync(
  db: UpwindCloudStorage,
  Id: string,
): Promise<void> {
  await deleteDoc(doc(db, "items", Id)).then(() => {
    console.log("Successfully deleted task.");
  });
}

//#endregion

//#region Styles

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    flex: 1,
    paddingTop: 64,
  },
  heading: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
  },
  flexRow: {
    flexDirection: "row",
  },
  input: {
    borderColor: "#4630eb",
    borderRadius: 4,
    borderWidth: 1,
    flex: 1,
    height: 48,
    margin: 16,
    padding: 8,
  },
  listArea: {
    backgroundColor: "#f0f0f0",
    flex: 1,
    paddingTop: 16,
  },
  sectionContainer: {
    marginBottom: 16,
    marginHorizontal: 16,
  },
  sectionHeading: {
    fontSize: 18,
    marginBottom: 8,
  },
  item: {
    backgroundColor: "#fff",
    borderColor: "#000",
    borderWidth: 1,
    padding: 8,
  },
  itemDone: {
    backgroundColor: "#1c9963",
  },
  itemText: {
    color: "#000",
  },
  itemTextDone: {
    color: "#fff",
  },
});

//#endregion
